import { normalizeHost } from './resolver';

/**
 * OXY-HOST · R2 — the ONE trusted request-host reader.
 *
 * Custom domains reach the app through the Praxella Cloudflare Worker
 * (infra/cf-worker), which carries the original hostname in X-Praxella-Host and
 * proves itself with X-Praxella-Proxy-Key. This helper returns that proxied host
 * ONLY when the key matches PROXY_HOST_SECRET (constant-time compare); otherwise
 * the plain Host header.
 *
 * SECURITY: it deliberately does NOT trust X-Forwarded-Host. Railway's edge
 * (railway-hikari) overwrites the X-Forwarded-* family, so it can't carry the
 * Worker's value anyway (R1 probe evidence) — and trusting a forwarded host
 * unconditionally is spoofable on any edge that doesn't sanitize it. The custom
 * header + secret is the only trusted channel.
 *
 * BYTE-IDENTICAL FALLBACK: when PROXY_HOST_SECRET is unset (no proxy configured),
 * this is a pure passthrough returning the plain Host — current behavior.
 */

const HOST_HEADER = 'x-praxella-host';
const KEY_HEADER = 'x-praxella-proxy-key';

/** Length-safe constant-time string compare (no early exit, no runtime dep). */
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

type HeaderReader = { get(name: string): string | null };

/**
 * The trusted host for this request. Prefers the Worker's proxied host when the
 * proxy key matches the configured secret; else the plain Host.
 */
export function effectiveHost(headers: HeaderReader): string | null {
  const plain = headers.get('host');
  const secret = process.env.PROXY_HOST_SECRET;

  if (secret) {
    const key = headers.get(KEY_HEADER);
    const proxied = headers.get(HOST_HEADER);
    if (key && proxied && timingSafeEqual(key, secret)) {
      return normalizeHost(proxied) ?? plain;
    }
  }

  return plain;
}
