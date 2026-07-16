/**
 * OXY-HOST · R3 — pure routing/header helpers for the Praxella custom-domain proxy.
 *
 * These are runtime-free (only the WHATWG URL global, available in Node + Workers)
 * so they unit-test without a Workers runtime. The Worker (worker.mjs) is a thin
 * shell over them. Header names are the contract shared with the app's
 * effectiveHost() reader (src/lib/host/effective-host.ts):
 *   X-Praxella-Host      — the ORIGINAL client hostname (what the app resolves on)
 *   X-Praxella-Proxy-Key — the shared secret proving the request came via the Worker
 *
 * WHY a custom header, not X-Forwarded-Host: Railway's edge (railway-hikari)
 * overwrites the X-Forwarded-* family, so a value the Worker set there would be
 * clobbered before the app sees it. A custom name passes through untouched.
 */

export const HOST_HEADER = 'x-praxella-host';
export const KEY_HEADER = 'x-praxella-proxy-key';

/** Lowercased hostname without port; '' for empty/invalid input. */
export function normalizeHostname(host) {
  if (!host || typeof host !== 'string') return '';
  return host.trim().toLowerCase().split(':')[0];
}

/** True when the hostname is a www. subdomain. */
export function isWww(hostname) {
  return normalizeHostname(hostname).startsWith('www.');
}

/** Strip a single leading www. label (idempotent for non-www). */
export function apexHost(hostname) {
  const h = normalizeHostname(hostname);
  return h.startsWith('www.') ? h.slice(4) : h;
}

/**
 * If the URL's host is www.<apex>, return the apex URL (scheme + path + query
 * preserved) for a 301; otherwise null. Pure string transform via URL.
 */
export function wwwApexLocation(urlStr) {
  const u = new URL(urlStr);
  if (!isWww(u.hostname)) return null;
  u.hostname = apexHost(u.hostname);
  u.port = '';
  return u.toString();
}

/**
 * The origin URL to fetch: the same path + query, but pointed at the Railway
 * origin host over HTTPS. The client hostname is carried separately in the
 * X-Praxella-Host header, not in the URL/Host.
 */
export function buildOriginUrl(urlStr, originHost) {
  const u = new URL(urlStr);
  const o = new URL(`https://${originHost}`);
  u.protocol = 'https:';
  u.hostname = o.hostname;
  u.port = o.port; // usually empty
  return u.toString();
}

/**
 * Header pairs to send to the origin: the incoming headers with any
 * client-supplied X-Praxella-* stripped (anti-spoof), then our identity pair
 * appended. Accepts/returns an array of [key, value] pairs so it is pure and
 * trivially testable (the Worker converts to/from Headers).
 */
export function proxyRequestHeaders(pairs, { hostname, secret }) {
  const out = [];
  for (const [k, v] of pairs) {
    const key = String(k).toLowerCase();
    if (key === HOST_HEADER || key === KEY_HEADER) continue; // never trust client copies
    out.push([k, v]);
  }
  out.push(['X-Praxella-Host', normalizeHostname(hostname)]);
  if (secret) out.push(['X-Praxella-Proxy-Key', secret]);
  return out;
}
