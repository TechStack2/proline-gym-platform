/**
 * PROXY-ACTIONS — the Server-Action origin allowlist, in one testable place.
 *
 * WHY: custom tenant domains reach the app through the Cloudflare Worker
 * (infra/cf-worker) → Railway. Next.js CSRF-checks every Server Action POST by
 * comparing the request's Origin against the Host it sees — and on a proxied
 * request that is Origin: https://proline-gym.com vs Host: proline.up.railway.app,
 * so Next rejected the action with a 500 BEFORE any app code ran (every write on
 * every custom domain, read paths unaffected — which is why it hid).
 * X-Forwarded-Host cannot carry the tenant host: Railway's edge OVERWRITES the
 * X-Forwarded-* family (the proven reason the proxy uses X-Praxella-Host). The
 * supported mechanism is `experimental.serverActions.allowedOrigins`.
 *
 * next.config.mjs consumes this list (see the DRIFT-PIN note there — a unit test
 * asserts the config and this module agree); src/middleware.ts uses
 * `isAllowedActionOrigin` to make a future misconfiguration LOUD instead of a
 * silent 500 (the R2 ops guard).
 *
 * Entries are HOSTS (optionally host:port, optionally a `*.` wildcard label) —
 * never schemes/paths, matching Next's allowedOrigins format.
 */

/** The static, environment-independent origins. */
export const STATIC_ACTION_ORIGINS = [
  // Dev servers (next dev / next start on the pinned port 3000).
  'localhost:3000',
  '127.0.0.1:3000',
  // The Railway origin itself (direct, unproxied).
  'proline.up.railway.app',
  // The vendor apex + every gym subdomain.
  'praxella.com',
  'www.praxella.com',
  '*.praxella.com',
] as const;

/**
 * Tenant CUSTOM domains are dynamic (gym_domains), so they arrive via env:
 * PRAXELLA_ACTION_ORIGINS — comma-separated hosts, trimmed, lowercased,
 * empty-safe. Onboarding a custom domain MUST add it here (runbook step 6);
 * prod currently needs: `proline-gym.com,www.proline-gym.com`.
 */
export function envActionOrigins(raw = process.env.PRAXELLA_ACTION_ORIGINS): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** The full allowlist: static + env. */
export function actionOrigins(raw = process.env.PRAXELLA_ACTION_ORIGINS): string[] {
  return [...STATIC_ACTION_ORIGINS, ...envActionOrigins(raw)];
}

/**
 * Does an Origin host match the allowlist? Exact match, or a `*.suffix` entry
 * matching any subdomain of that suffix. Mirrors Next's own semantics closely
 * enough for the middleware's LOUD-misconfig signal (Next itself remains the
 * enforcing layer — this never loosens or replaces the CSRF check).
 */
export function isAllowedActionOrigin(
  originHost: string | null | undefined,
  list: string[] = actionOrigins(),
): boolean {
  if (!originHost) return false;
  const host = originHost.trim().toLowerCase();
  return list.some((entry) =>
    entry.startsWith('*.')
      ? host.endsWith(entry.slice(1)) && host.length > entry.length - 1
      : entry === host,
  );
}
