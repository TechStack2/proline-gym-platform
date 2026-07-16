# Praxella custom-domain proxy (Cloudflare Worker)

**OXY-HOST · R3.** A reverse proxy that lets tenant-owned custom domains (e.g.
`proline-gym.com`) serve the Praxella app hosted on Railway, without consuming
Railway custom-domain slots. It streams every request to the Railway origin and
tells the app which hostname the visitor actually used.

```
visitor ──► proline-gym.com ──► Cloudflare Worker ──► https://proline.up.railway.app
                                   │ adds:  X-Praxella-Host: proline-gym.com
                                   │        X-Praxella-Proxy-Key: <PROXY_HOST_SECRET>
                                   │ 301s:  www.proline-gym.com → proline-gym.com
```

## Why a custom header (not X-Forwarded-Host)

Railway's edge (`railway-hikari`) **overwrites** the `X-Forwarded-*` family, so a
value the Worker set there would be clobbered before the app sees it (proven by the
R1 probe: a spoofed `X-Forwarded-Host` never changed the resolved gym). A custom
header name (`X-Praxella-Host`) passes through untouched, and the app trusts it only
when `X-Praxella-Proxy-Key` matches its `PROXY_HOST_SECRET`
(`src/lib/host/effective-host.ts`, constant-time compare).

## Files

| File | Purpose |
|---|---|
| `src/worker.mjs` | The Worker entry (`fetch` handler) — thin shell over `lib.mjs` |
| `src/lib.mjs` | Pure routing/header helpers (www→apex, origin URL, identity headers) |
| `src/lib.test.mjs` | Unit tests (run by the repo's `npm test`; no Workers runtime needed) |
| `wrangler.toml` | Config: `main`, `ORIGIN_HOST` var; routes attached per tenant |

## Behavior

- **Streams faithfully**: method, body, query, and the origin response are passed
  through untouched. Status codes are preserved (404 stays 404); the origin's
  redirects are returned unmodified (`redirect: 'manual'`).
- **Identity headers**: adds `X-Praxella-Host` (the original hostname) +
  `X-Praxella-Proxy-Key` (the secret). Any client-supplied `X-Praxella-*` is
  stripped first, so a visitor can't forge identity.
- **www → apex**: `www.<domain>` is `301`'d to the apex (path + query preserved)
  inside the Worker, before proxying.

## Deploy (auditor / ops — NOT done by this slice)

Prerequisites: the tenant's domain is a Cloudflare zone (or a CF-for-SaaS custom
hostname), and `wrangler` is authenticated to the Praxella Cloudflare account.

```bash
cd infra/cf-worker

# 1. Set the shared secret (SAME value as the app's PROXY_HOST_SECRET env on Railway)
npx wrangler secret put PROXY_HOST_SECRET

# 2. Attach the Worker to the tenant's domain (apex + www). Either add a `routes`
#    block to wrangler.toml, or add the route in the Cloudflare dashboard:
#      proline-gym.com/*      → praxella-proxy
#      www.proline-gym.com/*  → praxella-proxy

# 3. Deploy
npx wrangler deploy

# 4. Verify the origin + identity round-trip
curl -sI https://proline-gym.com/en        # 200, served by the app
curl -sI https://www.proline-gym.com/en     # 301 → https://proline-gym.com/en
```

Then finish the tenant wiring per `docs/runbooks/custom-domain.md` (gym_domains
row, Supabase redirect URL, canonical verification).

> **Never** enable Cloudflare "Under Attack" mode or aggressive bot-fighting on a
> tenant zone — it challenges Googlebot and tanks the tenant's SEO.
