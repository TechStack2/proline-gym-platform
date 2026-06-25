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

// ISO-DB: e2e runs `next start` (prod CSP path) against a LOCAL Supabase stack
// (http://127.0.0.1:54321), not *.supabase.co. The hardcoded src lists below
// would CSP-block the browser client AND storage <img> avatars → failure. Derive
// the configured Supabase origin from env and, when it is NOT a *.supabase.co
// host (i.e. the local stack), additionally allow it. Prod (cloud) is unchanged:
// the host matches *.supabase.co (img-src `https:` + connect-src wildcard) so
// nothing is added.
function localSupabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return '';
  try {
    const { protocol, host } = new URL(url);
    if (host.endsWith('.supabase.co')) return ''; // already covered
    return `${protocol}//${host}`;
  } catch {
    return '';
  }
}
// connect-src needs the http(s) origin + the ws(s) variant (realtime).
function extraSupabaseConnectSrc(): string {
  const origin = localSupabaseOrigin();
  if (!origin) return '';
  const wsOrigin = origin.replace(/^http/, 'ws');
  return ` ${origin} ${wsOrigin}`;
}
// img-src already allows `https:` (cloud avatars); add the local http origin so
// storage <img> avatars render against the local stack (ADM-2 / coach-lp).
function extraSupabaseImgSrc(): string {
  const origin = localSupabaseOrigin();
  return origin ? ` ${origin}` : '';
}

function buildProdCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'strict-dynamic' 'nonce-${nonce}'`,
    `style-src 'self' 'strict-dynamic' 'nonce-${nonce}'`,
    // OFF-1: the service worker IS the offline foundation, but `script-src` uses
    // 'strict-dynamic' — under which Chrome's worker-src FALLBACK refuses
    // `navigator.serviceWorker.register('/sw.js')` (the worker URL is not a
    // dynamically-inserted trusted script). With no explicit worker-src the SW
    // never registered in prod → no offline ANYWHERE (this is why G2's
    // serviceWorker.ready hung). Allow same-origin workers explicitly.
    "worker-src 'self'",
    `img-src 'self' data: https: blob:${extraSupabaseImgSrc()}`,
    "font-src 'self'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${extraSupabaseConnectSrc()}`,
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
  // ISO-DB: the e2e suite logs in 4 worker-slots × 5 roles = 20 times from the
  // SAME CI IP, which trips the 5/min per-IP auth limit (the login page then 429s
  // with no form → flaky setup). Per-IP limiting is meaningless when all test
  // traffic shares one IP, and no spec covers rate limiting. Disable it ONLY when
  // E2E_TEST_MODE is set (the e2e CI job; never set in prod → prod is unchanged).
  const rateLimitDisabled = process.env.E2E_TEST_MODE === '1';
  const isAuthEndpoint =
    !rateLimitDisabled && AUTH_PATTERNS.some(pattern => pattern.test(pathname));
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
