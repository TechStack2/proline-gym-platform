import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ─── Rate Limiter (in-memory, per-IP) ───
// Production-grade alternative: use @upstash/ratelimit with Redis
// For MVP this in-memory store works within the 1-year free tier constraints
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupRateLimitStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

function rateLimit(ip: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupRateLimitStore();
  const now = Date.now();
  const key = `rl:${ip}`;
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(key, newEntry);
    return { allowed: true, remaining: limit - 1, resetAt: newEntry.resetAt };
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: entry.count <= limit, remaining, resetAt: entry.resetAt };
}

function getClientIp(request: NextRequest): string {
  // Check common proxy/load-balancer headers
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

// ─── Auth Rate Limit Config ───
const AUTH_RATE_LIMIT = {
  windowMs: 60 * 1000,       // 1 minute
  maxAttempts: 5,            // 5 requests per minute
};

const AUTH_PATTERNS = [
  /\/auth\/login/,
  /\/auth\/verify/,
  /\/auth\/register/,
];

// ─── CSP Nonce Generator (Web Crypto — Edge-runtime compatible) ───
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // base64url, no padding
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildProdCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'strict-dynamic' 'nonce-${nonce}'`,
    `style-src 'self' 'strict-dynamic' 'nonce-${nonce}'`,
    "img-src 'self' data: https: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    // AX-3: the Facility section embeds the keyless OpenStreetMap map (the
    // operator's "view our location" block). frame-src 'self' silently REFUSED
    // it in prod → the map rendered as a grey box (CI only checked the iframe
    // src attribute, never that it loaded cross-origin). Allow only OSM's embed.
    "frame-src 'self' https://www.openstreetmap.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === 'development';

  // Skip middleware for static files, API routes, and Supabase auth callback
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth/callback')
  ) {
    return NextResponse.next();
  }

  // ─── Rate Limiting for Auth Endpoints ───
  const isAuthEndpoint = AUTH_PATTERNS.some(pattern => pattern.test(pathname));
  // Capture rate-limit result once to avoid double-counting (was called 3× per request)
  let rateLimitResult: { allowed: boolean; remaining: number; resetAt: number } | null = null;

  if (isAuthEndpoint) {
    const ip = getClientIp(request);
    rateLimitResult = rateLimit(ip, AUTH_RATE_LIMIT.maxAttempts, AUTH_RATE_LIMIT.windowMs);

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(AUTH_RATE_LIMIT.maxAttempts),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.resetAt / 1000)),
          },
        },
      );
    }
  }

  // ─── Helper: attach rate-limit headers to a response ───
  function attachRateLimitHeaders(response: NextResponse) {
    if (isAuthEndpoint && rateLimitResult) {
      response.headers.set('X-RateLimit-Limit', String(AUTH_RATE_LIMIT.maxAttempts));
      response.headers.set('X-RateLimit-Remaining', String(Math.max(0, rateLimitResult.remaining)));
      response.headers.set('X-RateLimit-Reset', String(Math.ceil(rateLimitResult.resetAt / 1000)));
    }
  }

  // ─── Supabase session refresh + auth guard (wrapped in try/catch to prevent
  //     server crashes when Supabase is unreachable or the anon key is invalid) ───
  let supabaseResponse: NextResponse;
  try {
    supabaseResponse = await updateSession(request);
  } catch (err) {
    // Don't crash the server — log the error and fall through gracefully.
    // The login page is a client component that handles auth independently,
    // and protected pages will redirect via their own getUser() guards.
    console.error('[middleware] Supabase session refresh failed:', (err as Error).message);
    supabaseResponse = NextResponse.next({ request });
  }

  // If auth guard returned a redirect (not authenticated → login, or logged in → dashboard), return it
  if (supabaseResponse.status >= 300 && supabaseResponse.status < 400) {
    attachRateLimitHeaders(supabaseResponse);
    return supabaseResponse;
  }

  // ─── Production CSP: generate per-request nonce + set header ───
  let nonce = '';
  if (!isDev) {
    nonce = generateNonce();
    supabaseResponse.headers.set('Content-Security-Policy', buildProdCspHeader(nonce));
    // Pass nonce to downstream via request header (accessible in Server Components)
    supabaseResponse.headers.set('X-CSP-Nonce', nonce);
  }

  // Reuse captured rate-limit result to avoid double-counting
  attachRateLimitHeaders(supabaseResponse);

  // Apply i18n middleware for all other routes (landing, auth, etc.)
  const intlResponse = intlMiddleware(request);

  // Merge rate limit + CSP headers into i18n response.
  // AX-1 ROOT-CAUSE FIX: `x-middleware-override-headers` is Next's DIRECTIVE
  // listing which request headers the middleware forwards to the render.
  // Blind-copying Supabase's list over intl's DROPPED `x-next-intl-locale`
  // from the directive, so next-intl could never resolve the locale on any
  // route where updateSession produced overrides — every useTranslations/
  // getMessages call fell back to defaultLocale (en) under /ar and /fr
  // ("Arabic is not fully active on multiple pages", verbatim). UNION the
  // two lists instead so BOTH the refreshed-cookie and locale forwards live.
  supabaseResponse.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'content-type' || k === 'location') return;
    if (k === 'x-middleware-override-headers') {
      const existing = intlResponse.headers.get(k);
      const union = new Set(
        [...(existing ? existing.split(',') : []), ...value.split(',')]
          .map((h) => h.trim())
          .filter(Boolean),
      );
      intlResponse.headers.set(k, [...union].join(','));
      return;
    }
    intlResponse.headers.set(key, value);
  });

  // Forward the nonce to i18n response as well
  if (!isDev && nonce) {
    intlResponse.headers.set('X-CSP-Nonce', nonce);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*|favicon.ico).*)',
  ],
};
