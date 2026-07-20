# Runbook — onboard a tenant custom domain (OXY-HOST)

Repeatable recipe to put a paying tenant on their own domain (e.g.
`proline-gym.com`) through the Praxella Cloudflare Worker → Railway. Ops task
(owner + auditor); **not** performed by app code. ~15 min + DNS propagation.

**Architecture:** tenant domain → **Cloudflare Worker** (`infra/cf-worker`) →
Railway origin. The Worker carries the original hostname in `X-Praxella-Host` and
proves itself with `X-Praxella-Proxy-Key`; the app trusts it only when the key
matches `PROXY_HOST_SECRET` (`src/lib/host/effective-host.ts`). See
`infra/cf-worker/README.md`.

---

## 0. One-time platform setup (first tenant only)

1. Pick a strong `PROXY_HOST_SECRET` (e.g. `openssl rand -hex 32`).
2. Set it in **both** places, identical value:
   - Railway app service → Variables → `PROXY_HOST_SECRET`
   - CF Worker → `cd infra/cf-worker && npx wrangler secret put PROXY_HOST_SECRET`
3. Deploy the Worker once: `npx wrangler deploy` (see the Worker README).

> Until `PROXY_HOST_SECRET` is set on the app, `effectiveHost` ignores
> `X-Praxella-Host` and falls back to the plain Host — so a half-configured proxy
> fails safe to the DEFAULT gym instead of trusting an unverified host.

---

## 1. Cloudflare zone (or CF-for-SaaS hostname)

- **Tenant-owned zone:** add the domain as a Cloudflare zone; point the tenant's
  registrar NS at Cloudflare. Proxy (orange cloud) ON for the apex + `www`.
- **CF-for-SaaS (tenant keeps their DNS):** add a Custom Hostname in the Praxella
  SaaS zone; the tenant adds the CNAME/verification records CF provides. (CF-for-SaaS
  covers 100 hostnames on the free plan — see the budget note.)

> ⚠️ **Never** enable Cloudflare **"Under Attack" mode** or aggressive
> **Bot Fight Mode** on a tenant zone — they challenge Googlebot and tank the
> tenant's SEO. Use "Essentially Off" bot settings; a normal WAF is fine.

## 2. Attach the Worker route

Add the apex **and** `www` (www is 301'd to apex inside the Worker, but the route
must cover it to issue the redirect):

```
proline-gym.com/*      → praxella-proxy
www.proline-gym.com/*  → praxella-proxy
```

Either add a `routes` block to `infra/cf-worker/wrangler.toml` and
`npx wrangler deploy`, or add the routes in the CF dashboard (Workers Routes).

## 3. Map the domain → gym (`gym_domains`)

Insert the tenant's domain, marking the canonical host **primary**. Service-role
(the table is RLS-locked). One gym may own several rows (apex + secondaries); only
one is `is_primary`.

```sql
insert into gym_domains (gym_id, domain, is_primary)
values ((select id from gyms where slug = 'proline'), 'proline-gym.com', true);
```

(`domain` is lowercased, no port. Do NOT add a `www.` row — the Worker 301s www→apex.)

## 4. Supabase Auth redirect URL

Add the custom origin to the Supabase Auth **Redirect URLs** allowlist so magic-link
/ OTP callbacks resolve on the tenant domain:

```
https://proline-gym.com/**
```

## 5. (Optional, enables primary canonical + alias-301) apply the primary-domain reader

Canonicalization works self-referentially out of the box: on `proline-gym.com` the
landing already emits `rel=canonical` → `proline-gym.com`, hreflang + og:url + a
per-host robots/sitemap on that domain. To also (a) canonicalize the gym's
`*.praxella.com` subdomain to the custom domain and (b) **301** any non-primary
alias → the primary, the app needs one anon-safe reader of `gym_domains.is_primary`
(the existing `get_gym_slug_by_domain` is domain→slug only). This is a migration,
so the auditor applies it in the ops cycle:

```sql
-- get_gym_primary_domain(slug) → the gym's PRIMARY custom domain, or NULL.
create or replace function get_gym_primary_domain(p_slug text)
returns text
language sql stable security definer
set search_path = public
as $$
  select d.domain
  from gym_domains d
  join gyms g on g.id = d.gym_id
  where g.slug = p_slug and g.is_active and d.is_primary
  limit 1;
$$;
revoke all on function get_gym_primary_domain(text) from public;
grant execute on function get_gym_primary_domain(text) to anon, authenticated;
```

Then wire it in `src/lib/host/primary-domain.ts` (replace the `return null` body with
the 1-line `rpc('get_gym_primary_domain', { p_slug: slug })` call — see the file's
header) and regenerate DB types. No other code changes: `canonicalOrigin` +
`aliasRedirectTarget` (`src/lib/host/canonical.ts`) already consume the value.

## 6. REQUIRED — Server-Action origin allowlist (`PRAXELLA_ACTION_ORIGINS`)

**Skipping this step silently breaks EVERY write on the new domain** (attendance,
payments, approvals, login-adjacent actions — all Server Actions), while reads
keep working. Next.js CSRF-rejects an action POST whose `Origin` (the tenant
domain) differs from the `Host` it sees (the Railway origin, because the Worker
proxies) unless the origin is allowlisted
(`experimental.serverActions.allowedOrigins`, fed from this env var —
PROXY-ACTIONS incident, 2026-07). `X-Forwarded-Host` cannot carry the tenant
host: Railway's edge overwrites the `X-Forwarded-*` family.

Append the new domain (apex + `www`) to the comma-separated list on the Railway
app service — **do not replace the existing entries** — then redeploy (Railway
redeploys on a variable change; the value is read at server boot):

```bash
# Read the current value first, then append:
railway variables --set "PRAXELLA_ACTION_ORIGINS=proline-gym.com,www.proline-gym.com,<new-domain>,www.<new-domain>"
```

(Equivalent: Railway dashboard → the app service → Variables →
`PRAXELLA_ACTION_ORIGINS`.) `*.praxella.com`, the apex, the Railway origin and
localhost are built in (next.config.mjs) — this variable is ONLY the custom
domains. Current prod value: `proline-gym.com,www.proline-gym.com`.

**Loud-failure guard:** if a write is attempted from a domain missing here, the
server log shows a `[proxy-actions]` error naming the origin and this runbook
step — that log line, not a user's silent 500, should be the first symptom.

## 7. Verify

```bash
curl -sI https://proline-gym.com/en                       # 200, app renders
curl -sI https://www.proline-gym.com/en                   # 301 → https://proline-gym.com/en
curl -s  https://proline-gym.com/en | grep -i canonical   # rel=canonical → proline-gym.com/en
curl -s  https://proline-gym.com/robots.txt               # Sitemap/Host = https://proline-gym.com
curl -s  https://proline-gym.com/sitemap.xml | grep -o 'https://proline-gym.com/..'
# PROXY-ACTIONS (step 6): a server-action-shaped POST from the tenant origin must
# NOT be CSRF-rejected (200 = passed the origin check; 500 = the allowlist is
# missing the domain). The bogus Next-Action id never reaches real action code.
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://proline-gym.com/en \
  -H 'Next-Action: 7f000000000000000000000000000000000000ff' \
  -H 'Origin: https://proline-gym.com' -H 'Content-Type: text/plain' --data x   # 200
```

- Landing shows the tenant's brand + name (not the demo).
- `rel=canonical`, `og:url`, hreflang (ar/en/fr + x-default), robots `Sitemap`/`Host`,
  and sitemap URLs all on `https://proline-gym.com`.
- The Railway host (`proline.up.railway.app`) and the demo are **unchanged**
  (DEFAULT gym, `SITE_URL` canonical) — a custom-domain onboarding never regresses
  gyms that don't have one.

## Rollback

Delete the `gym_domains` row and detach the Worker route; the domain stops
resolving to the gym (falls back to DEFAULT / vendor). No app deploy needed.
