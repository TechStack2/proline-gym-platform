import { test, expect } from '@playwright/test'

/**
 * PROXY-ACTIONS — the Server-Action cross-origin regression guard (P0 field
 * outage: every write on every proxied custom domain 500'd because Next's CSRF
 * check saw Origin: <tenant domain> against Host: <railway origin> and no
 * allowedOrigins allowlist existed).
 *
 * HOW THE PROXY SHAPE IS SIMULATED: the Cloudflare Worker produces a request
 * whose Origin header names the tenant domain while Host stays the origin
 * server's own — so we POST directly to the app (Host: localhost:<port>) with a
 * FOREIGN Origin header via Playwright's APIRequestContext (a Node client, free
 * to set Origin; a browser page could not). The `Next-Action` header makes Next
 * route it through the Server-Action CSRF check; the bogus action id never
 * reaches real action code. Mirrors the incident probes exactly:
 *   · allowlisted foreign origin  → 200 (passed the origin check)
 *   · non-allowlisted origin      → 500 (CSRF protection still ENFORCED)
 * The harness env sets PRAXELLA_ACTION_ORIGINS=actions-proxy.e2e.test (e2e.yml +
 * scripts/e2e-local.sh), so the accepted case exercises the ENV-fed tenant path
 * (the exact mechanism prod uses for proline-gym.com), and *.praxella.com
 * exercises the static wildcard.
 */
const BOGUS_ACTION = { 'Next-Action': '7f000000000000000000000000000000000000ff', 'Content-Type': 'text/plain' }

test('PROXY-ACTIONS · same-origin action POST passes (baseline)', async ({ request, baseURL }) => {
  const res = await request.post('/en', {
    headers: { ...BOGUS_ACTION, Origin: baseURL! },
    data: 'x',
  })
  expect(res.status(), 'self-origin action POST is accepted').toBe(200)
})

test('PROXY-ACTIONS · proxied shape with an ALLOWLISTED tenant origin passes (env-fed)', async ({ request }) => {
  const res = await request.post('/en', {
    headers: { ...BOGUS_ACTION, Origin: 'https://actions-proxy.e2e.test' },
    data: 'x',
  })
  expect(
    res.status(),
    'Origin ≠ Host but allowlisted via PRAXELLA_ACTION_ORIGINS → accepted (the custom-domain fix)',
  ).toBe(200)
})

test('PROXY-ACTIONS · proxied shape with a *.praxella.com origin passes (static wildcard)', async ({ request }) => {
  const res = await request.post('/en', {
    headers: { ...BOGUS_ACTION, Origin: 'https://prolinegym.praxella.com' },
    data: 'x',
  })
  expect(res.status(), 'gym subdomain origin → accepted (static wildcard)').toBe(200)
})

test('PROXY-ACTIONS · a NON-allowlisted cross-origin action POST is still rejected', async ({ request }) => {
  const res = await request.post('/en', {
    headers: { ...BOGUS_ACTION, Origin: 'https://evil.example.com' },
    data: 'x',
  })
  expect(
    res.status(),
    'the CSRF protection survives the fix — unknown origins are rejected, not accepted',
  ).toBe(500)
})
