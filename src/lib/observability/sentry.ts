/**
 * OBSERVE — shared Sentry config (isomorphic: imported by the client/server/edge
 * inits). Entirely ENV-DRIVEN: with no `NEXT_PUBLIC_SENTRY_DSN` the SDK is disabled
 * (a clean no-op at build + runtime), so this merges safely BEFORE the owner creates
 * the account. FREE-tier posture: errors are the product — NO session replay, and a
 * conservative traces sample (≤0.1). The DSN is NOT a secret (it ships in the client
 * bundle); only SENTRY_AUTH_TOKEN (source-map upload) is, and it's build-only.
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/** The public DSN, read the same way on client + server so CSP + init stay in sync. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

export const SENTRY_ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV || 'production';

/** FREE-tier: cap traces at 0.1 even if the env asks for more. Default 0.05. */
export const TRACES_SAMPLE_RATE = Math.min(
  0.1,
  Math.max(0, Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05')),
);

// ── Known noise we refuse to spend the free-tier quota on ──
export const IGNORE_ERRORS: (string | RegExp)[] = [
  // network aborts / offline churn (the SW + Supabase reads abort constantly)
  'AbortError',
  'The operation was aborted',
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
  'Load failed',
  'The network connection was lost',
  /network ?error/i,
  // benign browser noise
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Non-Error promise rejection captured',
  // service-worker registration/update churn (PWA-UPDATE)
  /ServiceWorker/i,
  'The operation is insecure.',
];

// ── PII scrub ──
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
// JWTs, sk-… secrets, and Bearer tokens.
const TOKEN_RE = /eyJ[\w-]+\.[\w-]+\.[\w-]+|sk-[\w-]{12,}|Bearer\s+[\w.\-]+/gi;
const SENSITIVE_KEY_RE = /^(authorization|cookie|set-cookie|token|access_token|refresh_token|password|phone|email|apikey|api_key|dsn)$/i;

function scrubString(s: string): string {
  return s.replace(TOKEN_RE, '[token]').replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]');
}
function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? '[redacted]' : scrubDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Strip user IDENTITY and scrub phones/emails/tokens from every event. The useful
 * grouping (gym slug + role) is carried by TAGS set in <SentryTags>, never the
 * `user` object. Returns null when the SDK is disabled (defence in depth).
 */
export function scrubbedBeforeSend(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (!SENTRY_DSN) return null;
  // No user identity — ever.
  event.user = undefined;
  const req = event.request as Record<string, unknown> | undefined;
  if (req) {
    delete req.cookies;
    if (req.headers && typeof req.headers === 'object') {
      const h = req.headers as Record<string, unknown>;
      delete h.authorization;
      delete h.cookie;
      delete h['set-cookie'];
    }
    if (typeof req.query_string === 'string') req.query_string = scrubString(req.query_string);
    event.request = scrubDeep(req) as ErrorEvent['request'];
  }
  if (typeof event.message === 'string') event.message = scrubString(event.message);
  if (event.extra) event.extra = scrubDeep(event.extra) as ErrorEvent['extra'];
  return event;
}

/** The options shared by all three inits (DSN + integrations added per-runtime). */
export const COMMON_INIT = {
  enabled: !!SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  ignoreErrors: IGNORE_ERRORS,
  sendDefaultPii: false, // never attach IP / cookies / headers by default
  beforeSend: scrubbedBeforeSend,
} as const;
