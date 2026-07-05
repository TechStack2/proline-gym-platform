import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * PWA-SESSION — a relaunched INSTALLED PWA (manifest start_url '/') with a valid
 * session must land on the user's HOME, not the public marketing landing.
 *
 * Repro: the session survives a standalone relaunch (Supabase SSR is cookie-backed),
 * but the middleware never redirected an AUTHENTICATED visitor off the landing root,
 * so the installed app reopened on the marketing hero instead of home.
 *
 * The persisted session == a role storageState; re-entering at the landing root
 * ('/' — the exact start_url — or '/{locale}') with that session IS the relaunch.
 * Guard: entry redirects to the role home (member/parent → /portal, staff →
 * /dashboard→/today) and the marketing landing (`pricing-plans`) is NOT rendered.
 */
async function relaunch(browser: Browser, role: keyof typeof ROLES, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale })
  return { ctx, page: await ctx.newPage() }
}

test('PWA-SESSION · member relaunch at start_url "/" lands on the portal home (not landing)', async ({ browser }) => {
  const { ctx, page } = await relaunch(browser, 'student')
  try {
    // The exact PWA start_url: bare '/', no locale, session cookie present.
    await page.goto('/')
    await expect(page, 'authenticated entry → portal home, not the landing').toHaveURL(/\/portal(\/|$|\?)/, { timeout: 20_000 })
    await expect(vis(page, '[data-testid="self-view"]').first(), 'the member home rendered').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="pricing-plans"]'), 'the marketing landing is NOT shown').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('PWA-SESSION · staff relaunch at "/{locale}" lands on the staff home (not landing)', async ({ browser }) => {
  const { ctx, page } = await relaunch(browser, 'owner')
  try {
    await page.goto('/en')   // the locale-root landing
    await expect(page, 'authenticated staff entry → /today front desk (via /dashboard)').toHaveURL(/\/(dashboard|today)(\/|$|\?)/, { timeout: 20_000 })
    await expect(page.locator('[data-testid="pricing-plans"]'), 'the marketing landing is NOT shown').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('PWA-SESSION · guardian relaunch lands on the portal (kid-switcher), not landing', async ({ browser }) => {
  const { ctx, page } = await relaunch(browser, 'parent')
  try {
    await page.goto('/')
    await expect(page, 'authenticated guardian entry → portal').toHaveURL(/\/portal(\/|$|\?)/, { timeout: 20_000 })
    await expect(page.locator('[data-testid="pricing-plans"]'), 'the marketing landing is NOT shown').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

/**
 * PWA-UPDATE — an installed PWA must not silently run stale code after a deploy. In
 * prod the SW registers + controls; a NEW build is detected as a WAITING worker and
 * surfaces a non-blocking "New version — Refresh" toast (skipWaiting:false keeps the
 * loaded page on its old assets until the user opts in); and the offline machine
 * (OFF-3) still serves the cached shell. /en, real sessions.
 */
test('PWA-UPDATE · SW registers, and a new build surfaces the "New version" prompt', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ storageState: ROLES.student.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/portal')
    // (1) The SW registers + takes CONTROL in prod (worker-src 'self'; a first install
    //     activates immediately even with skipWaiting:false). A real wait, so a
    //     non-registering SW fails here loudly.
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 45_000 })

    // (2) Simulate a NEW build: register a byte-different worker at the SAME scope. It
    //     installs + WAITS behind the active worker (skipWaiting:false), driving the
    //     exact updatefound → 'installed'-with-a-controller path a real deploy takes,
    //     so ServiceWorkerRegister surfaces the non-blocking toast. A dedicated probe
    //     script (public/sw-probe.e2e.js) keeps this deterministic — it does not rely
    //     on the runner intercepting the browser's own service-worker script fetch.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw-probe.e2e.js', { scope: '/' })
    })

    await expect(page.getByTestId('sw-update-toast'), 'the non-blocking update prompt appears')
      .toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Refresh' }), 'the prompt offers a Refresh action (reloads on tap)')
      .toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('PWA-UPDATE · the app still loads offline (SW serves the cached shell — OFF-3 intact)', async ({ browser }) => {
  test.setTimeout(150_000)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/today')
    // The SW registers + controls; skipWaiting:false does NOT delay the FIRST install.
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 45_000 })
    // Prime the page-cache under control (the first load happened before control).
    await page.reload()
    await page.waitForLoadState('networkidle').catch(() => {})

    // Offline reload: the SW serves the cached shell — not a browser error page. The
    // offline banner re-rendering proves the React app mounted from cache.
    await ctx.setOffline(true)
    await page.reload()
    await expect(page.locator('body'), 'the app shell rendered offline').not.toBeEmpty()
    await expect(
      vis(page, '[data-testid="shell-offline-banner"]').first(),
      'the React app mounted from cache + engaged the offline UX'
    ).toBeVisible({ timeout: 20_000 })
  } finally {
    await ctx.setOffline(false)
    await ctx.close()
  }
})
