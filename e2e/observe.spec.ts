import { test, expect } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * OBSERVE — Sentry is env-driven. CI has NO DSN, so this proves the app is
 * BYTE-IDENTICAL-behaved with Sentry installed but disabled:
 *   1. real staff pages render, fire ZERO CSP violations (the SDK adds nothing to
 *      script-src; no ingest origin is added to connect-src without a DSN), and make
 *      ZERO requests to any Sentry ingest host (the SDK is a no-op).
 *   2. the /api/debug-sentry smoke route is platform_admin-ONLY — anon → 401, a
 *      logged-in non-platform-admin (owner) → 403, and nothing throws/captures.
 */
test('OBSERVE · no DSN → Sentry inert: pages render, zero CSP violations, zero ingest requests', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  // Capture CSP violations at document-start (survives each navigation).
  await ctx.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __csp: string[] }).__csp.push((e as SecurityPolicyViolationEvent).violatedDirective),
    )
  })
  const page = await ctx.newPage()
  const sentryHits: string[] = []
  page.on('request', (r) => {
    if (/ingest\.[a-z.]*sentry\.io|\/\/[^/]*sentry\.io/i.test(r.url())) sentryHits.push(r.url())
  })
  try {
    for (const url of ['/en/today', '/en/schedule']) {
      await page.goto(url)
      await expect(vis(page, '[data-testid="shell-content"], main').first(), `${url} renders`).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(700) // let async inline styles + any SDK init settle
      const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
      expect(csp, `${url}: zero CSP violations with Sentry installed (no DSN) — got ${JSON.stringify(csp.slice(0, 4))}`).toEqual([])
    }
    expect(sentryHits, `no Sentry ingest requests when disabled — got ${JSON.stringify(sentryHits.slice(0, 2))}`).toEqual([])
  } finally {
    await ctx.close()
  }
})

test('OBSERVE · /api/debug-sentry is platform_admin-only (anon 401, owner 403)', async ({ browser }) => {
  // Anon (no session) → 401, nothing thrown.
  const anon = await browser.newContext({ locale: 'en' })
  try {
    const res = await anon.request.get('/api/debug-sentry')
    expect(res.status(), 'anon is unauthorized').toBe(401)
  } finally {
    await anon.close()
  }
  // Logged-in owner is NOT a platform_admin → 403 (the throw path is unreachable).
  const owner = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  try {
    const res = await owner.request.get('/api/debug-sentry')
    expect(res.status(), 'a non-platform-admin is forbidden').toBe(403)
  } finally {
    await owner.close()
  }
})
