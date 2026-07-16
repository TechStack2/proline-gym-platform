/**
 * OXY-HOST · R3 — the Praxella custom-domain reverse proxy (Cloudflare Worker).
 *
 * Streams every request faithfully to the Railway origin over HTTPS — method,
 * body, query, and the origin's response (status codes + redirects unmodified,
 * 404 stays 404). It adds two identity headers so the app can trust the original
 * hostname (see lib.mjs): X-Praxella-Host + X-Praxella-Proxy-Key. www.<domain> is
 * 301'd to the apex inside the Worker before proxying.
 *
 * Bindings (wrangler.toml / secrets):
 *   ORIGIN_HOST        (var)    — the Railway origin host, e.g. proline.up.railway.app
 *   PROXY_HOST_SECRET  (secret) — shared with the app's PROXY_HOST_SECRET env
 *
 * All routing/header logic lives in lib.mjs (pure, unit-tested). This file is the
 * thin runtime shell.
 */
import { wwwApexLocation, buildOriginUrl, proxyRequestHeaders } from './lib.mjs';

export default {
  async fetch(request, env) {
    // 1) www.<domain> → apex 301 (path + query preserved), before any proxying.
    const apex = wwwApexLocation(request.url);
    if (apex) {
      return new Response(null, { status: 301, headers: { Location: apex } });
    }

    const originHost = env.ORIGIN_HOST;
    if (!originHost) {
      return new Response('Proxy misconfigured: ORIGIN_HOST unset', { status: 500 });
    }

    // 2) Build the origin request: same method/body/query, HTTPS to the origin,
    //    identity headers added, client X-Praxella-* stripped.
    const hostname = new URL(request.url).hostname;
    const originUrl = buildOriginUrl(request.url, originHost);
    const headers = new Headers(
      proxyRequestHeaders([...request.headers], { hostname, secret: env.PROXY_HOST_SECRET })
    );

    const originRequest = new Request(originUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual', // pass the origin's redirects through untouched
    });

    // 3) Stream the origin response back faithfully (status + headers + body).
    const originResponse = await fetch(originRequest);
    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: originResponse.headers,
    });
  },
};
