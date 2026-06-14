import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * G2 — Offline attendance (the last V1 build slice). Proofs:
 *  1. Offline mark → queue → reconnect-sync → PERSISTED: a coach loads
 *     attendance online (roster cached), goes offline (context.setOffline),
 *     marks a student, the UI shows it + an "offline — N pending" banner; on
 *     reconnect the queue flushes through the EXISTING idempotent upsert and a
 *     FRESH context reads the mark from the server (pending back to 0).
 *  2. Idempotency: a second offline cycle re-marks the SAME (class,student,date)
 *     → the flush drains to 0 (the keyed upsert UPDATES in place; a duplicate
 *     INSERT would have errored on the unique key and left the item queued).
 *  3. Online path unchanged: a normal online mark still persists immediately.
 *  4. Scope guard: an online-only surface (money/payments) shows a clear
 *     "needs connection" state when offline.
 *
 * Only attendance is offline-capable in V1; ZERO new server schema.
 */
const STUDENT = 'Karim'
const today = new Date().toISOString().split('T')[0]

async function coachCtx(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES.coach.storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

/** Open the coach attendance page on `today` and select the seeded Muay Thai
 *  class (scheduled every weekday). Returns the class id. */
async function openRoster(page: Page): Promise<string> {
  await page.goto('/en/coach/attendance')
  const dateInput = page.locator('[data-testid="coach-attendance-date"]')
  await expect(dateInput).toBeVisible({ timeout: 15_000 })
  await dateInput.fill(today)
  const sel = page.locator('[data-testid="attendance-class-select"]')
  await expect(sel).toBeVisible({ timeout: 15_000 })
  const opt = page.locator('[data-testid="attendance-class-select"] option', { hasText: 'Muay Thai' }).first()
  await expect(opt).toBeAttached({ timeout: 15_000 })
  const classId = (await opt.getAttribute('value')) ?? ''
  await sel.selectOption(classId)
  await expect(page.locator(`[data-testid="attendance-student"][data-student-name*="${STUDENT}"]`).first())
    .toBeVisible({ timeout: 15_000 })
  return classId
}

/** Mark Karim `status` on the already-open roster and click Save. */
async function mark(page: Page, status: 'present' | 'absent' | 'late' | 'excused') {
  const row = page.locator(`[data-testid="attendance-student"][data-student-name*="${STUDENT}"]`).first()
  await row.locator(`[data-testid="att-status-${status}"]`).click()
  await page.getByTestId('attendance-save').click()
}

/** A fresh online context reads Karim's persisted status from the SERVER. */
async function serverStatus(browser: Browser): Promise<string | null> {
  const fresh = await coachCtx(browser)
  try {
    await openRoster(fresh.page)
    const row = fresh.page.locator(`[data-testid="attendance-student"][data-student-name*="${STUDENT}"]`).first()
    return await row.getAttribute('data-status')
  } finally {
    await fresh.ctx.close()
  }
}

test('G2 · offline mark → queue + banner → reconnect-sync → persisted + idempotent', async ({ browser }) => {
  test.setTimeout(220_000)
  const coach = await coachCtx(browser)
  try {
    // ── Load online so the roster caches ──
    await openRoster(coach.page)

    // ── Go OFFLINE → mark absent → queued + optimistic UI + pending banner ──
    await coach.ctx.setOffline(true)
    await mark(coach.page, 'absent')
    const row = coach.page.locator(`[data-testid="attendance-student"][data-student-name*="${STUDENT}"]`).first()
    await expect(row, 'optimistic UI keeps the offline mark').toHaveAttribute('data-status', 'absent')
    const banner = vis(coach.page, '[data-testid="attendance-offline-banner"]').first()
    await expect(banner, 'the offline / pending banner shows').toBeVisible({ timeout: 10_000 })
    await expect(banner).toHaveAttribute('data-online', 'false')
    expect(Number(await banner.getAttribute('data-pending')), 'at least one mark is pending').toBeGreaterThan(0)

    // ── Reconnect → the queue flushes (online event) → pending back to 0 ──
    await coach.ctx.setOffline(false)
    await expect(
      vis(coach.page, '[data-testid="attendance-offline-banner"]').first(),
      'the banner clears once the queue drains',
    ).toBeHidden({ timeout: 30_000 })

    // ── A FRESH server-side context shows the mark persisted ──
    expect(await serverStatus(browser), 'the offline mark reached the server').toBe('absent')

    // ── Idempotency: a 2nd offline cycle re-marks the SAME key → flush drains to
    //    0 (the keyed upsert updated in place; a dup INSERT would error + requeue) ──
    await coach.ctx.setOffline(true)
    await mark(coach.page, 'late')
    await expect(vis(coach.page, '[data-testid="attendance-offline-banner"]').first()).toBeVisible({ timeout: 10_000 })
    await coach.ctx.setOffline(false)
    await expect(
      vis(coach.page, '[data-testid="attendance-offline-banner"]').first(),
      'the re-flush drains cleanly (idempotent upsert, no duplicate-key error)',
    ).toBeHidden({ timeout: 30_000 })
    expect(await serverStatus(browser), 'last-write-wins: the latest status persisted, no stale/dup').toBe('late')
  } finally {
    await coach.ctx.close()
  }
})

test('G2 · online mark still persists immediately (no regression)', async ({ browser }) => {
  test.setTimeout(120_000)
  const coach = await coachCtx(browser)
  try {
    await openRoster(coach.page)
    await mark(coach.page, 'present')
    await expect(coach.page.locator('[data-sonner-toast]').first(), 'online save confirms').toBeVisible({ timeout: 15_000 })
    // No pending banner online (nothing queued).
    await expect(coach.page.locator('[data-testid="attendance-offline-banner"]')).toHaveCount(0)
    expect(await serverStatus(browser), 'the online mark persisted immediately').toBe('present')
  } finally {
    await coach.ctx.close()
  }
})

test('G2 · scope guard — an online-only surface shows "needs connection" offline', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/money')
    // NB: money is a (dashboard) page → double-shell (mobile+desktop); the tabs
    // render twice, so scope to the VISIBLE one (a bare .first() can pick the
    // hidden mobile copy at the desktop viewport).
    await expect(vis(page, '[data-testid="money-tabs"]').first()).toBeVisible({ timeout: 15_000 })
    // Online: the notice is null in BOTH shells.
    await expect(page.locator('[data-testid="needs-connection"]:visible')).toHaveCount(0)
    // Offline: payments are online-only → a clear needs-connection state appears.
    await ctx.setOffline(true)
    await expect(vis(page, '[data-testid="needs-connection"]').first(), 'payments surface flags needs-connection offline')
      .toBeVisible({ timeout: 15_000 })
    await ctx.setOffline(false)
  } finally {
    await ctx.close()
  }
})
