import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis, gymSlug, runId } from './helpers'

/**
 * GRW-1 — growth funnel: anon trial capture (attributed via a staff-created
 * campaign tracked link), spam guards, campaign QR/link, and the convert →
 * stats loop. Uses the run gym's own campaign (created in-test) so attribution
 * is end-to-end, not seeded.
 */
const RUN = runId().replace(/\D/g, '').slice(-6) || Date.now().toString().slice(-6)

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

test('GRW-1 · campaign → anon attributed capture → spam guards → QR/link → convert → funnel stats', async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const LEAD = `Grw Lead ${RUN}`
  const PHONE = `+96176${RUN}`

  // ── 1. Staff creates a campaign (wizard: name + source=instagram) ──
  const owner = await ctxFor(browser, 'owner')
  let code = ''
  try {
    await owner.page.goto('/en/campaigns')
    await vis(owner.page, '[data-testid="campaign-add-btn"]').first().click()
    const wiz = owner.page.locator('[data-testid="campaign-wizard"]:visible')
    await wiz.getByTestId('campaign-name').fill(`IG Promo ${RUN}`)
    await wiz.locator('[data-testid="campaign-source-chip"][data-value="instagram"]').click()
    await wiz.getByTestId('wizard-next').click()
    await wiz.getByTestId('wizard-submit').click()

    const card = vis(owner.page, '[data-testid="campaign-card"]').first()
    await expect(card, 'the new campaign card appears').toBeVisible({ timeout: 15_000 })
    code = (await card.getAttribute('data-code')) ?? ''
    expect(code, 'campaign has a tracked code').toBeTruthy()

    // Tracked link + QR render (the screenshot-into-IG artifact).
    await expect(card.getByTestId('campaign-link'), 'tracked link shows').toContainText(`?c=${code}`)
    await expect(card.getByTestId('campaign-qr'), 'client-side QR renders').toBeVisible({ timeout: 15_000 })
  } finally {
    await owner.ctx.close()
  }

  // ── 2. Anon visitor lands via ?c=CODE and submits the capture form ──
  const anonCtx = await browser.newContext({ locale: 'en' })
  const anon = await anonCtx.newPage()
  try {
    await anon.goto(`/en?gym=${encodeURIComponent(gymSlug())}&c=${encodeURIComponent(code)}`)
    await anon.locator('#trial-name').fill(LEAD)
    await anon.locator('#trial-phone').fill(PHONE)
    await anon.locator('[data-testid="trial-interest-chip"]').first().click()
    await anon.getByTestId('trial-submit').click()
    await expect(anon.getByTestId('trial-success'), 'capture reaches the success state').toBeVisible({ timeout: 15_000 })

    // ── 3a. Spam: filled honeypot → silently no lead ──
    await anon.goto(`/en?gym=${encodeURIComponent(gymSlug())}&c=${encodeURIComponent(code)}`)
    await anon.locator('#trial-name').fill(`Bot ${RUN}`)
    await anon.locator('#trial-phone').fill(`+96175${RUN}`)
    await anon.locator('[data-testid="trial-honeypot"]').fill('http://spam.example')
    await anon.getByTestId('trial-submit').click()
    await expect(anon.getByTestId('trial-success')).toBeVisible({ timeout: 15_000 }) // looks ok to the bot

    // ── 3b. Dedup: same phone within window → updates, no duplicate ──
    await anon.goto(`/en?gym=${encodeURIComponent(gymSlug())}&c=${encodeURIComponent(code)}`)
    await anon.locator('#trial-name').fill(LEAD)
    await anon.locator('#trial-phone').fill(PHONE)
    await anon.getByTestId('trial-submit').click()
    await expect(anon.getByTestId('trial-success')).toBeVisible({ timeout: 15_000 })
  } finally {
    await anonCtx.close()
  }

  // ── 4. Staff: the attributed lead is in Prospects, fresh-highlighted, one row ──
  const owner2 = await ctxFor(browser, 'owner')
  try {
    await owner2.page.goto(`/en/students?tab=prospects&search=${encodeURIComponent('Grw')}`)
    const leadCards = owner2.page.locator(`[data-testid="lead-card"][data-lead-name="${LEAD}"]:visible`)
    await expect(leadCards.first(), 'attributed capture appears in Prospects').toBeVisible({ timeout: 15_000 })
    await expect(leadCards, 'dedup kept it a single lead (no duplicate)').toHaveCount(1)
    const card = leadCards.first()
    await expect(card, 'fresh inquiry highlighted').toHaveAttribute('data-fresh', 'true')
    await expect(card.getByTestId('lead-source'), 'source = campaign source (Instagram)').toHaveText(/Instagram/i)
    // The bot (honeypot) lead must NOT exist.
    await owner2.page.goto(`/en/students?tab=prospects&search=${encodeURIComponent('Bot')}`)
    await expect(
      owner2.page.locator(`[data-testid="lead-card"][data-lead-name="Bot ${RUN}"]:visible`),
      'honeypot submission created no lead',
    ).toHaveCount(0)

    // ── 5. Convert the captured lead (23R) → member ──
    await owner2.page.goto(`/en/students?tab=prospects&search=${encodeURIComponent('Grw')}`)
    const conv = owner2.page.locator(`[data-testid="lead-card"][data-lead-name="${LEAD}"]:visible`).first()
    await conv.getByTestId('convert-open').click()
    const cmodal = owner2.page.locator('[data-testid="convert-modal"]:visible')
    await expect(cmodal).toBeVisible()
    const planValue = await cmodal.locator('[data-testid="convert-plan"] option').nth(1).getAttribute('value')
    await cmodal.getByTestId('convert-plan').selectOption(planValue!)
    await cmodal.getByTestId('convert-confirm').click()
    await expect(conv.getByTestId('invite-badge'), 'convert succeeded').toBeVisible({ timeout: 20_000 })

    // ── 6. Campaign stats: 1 lead → 1 conversion ──
    await owner2.page.goto('/en/campaigns')
    const cstat = vis(owner2.page, `[data-testid="campaign-card"][data-code="${code}"]`).first()
    await expect(cstat.getByTestId('campaign-leads')).toHaveText(/[1-9]/, { timeout: 15_000 })
    await expect(cstat.getByTestId('campaign-converted'), 'the converted capture counts on the campaign').toHaveText(/[1-9]/)

    // ── 7. Prospects funnel by-source reflects the Instagram conversion ──
    await owner2.page.goto('/en/students?tab=prospects')
    const srcRow = vis(owner2.page, '[data-testid="funnel-by-source-row"][data-key="instagram"]').first()
    await expect(srcRow, 'by-source has an Instagram row').toBeVisible({ timeout: 15_000 })
    await expect(srcRow.getByTestId('row-converted'), 'Instagram source shows a conversion').toHaveText(/[1-9]/)
    await shot(owner2.page, testInfo, 'grw1-funnel')
  } finally {
    await owner2.ctx.close()
  }
})

async function shot(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo, name: string) {
  const path = `screenshots/${name}.png`
  await page.screenshot({ path, fullPage: true }).catch(() => {})
  await testInfo.attach(name, { path, contentType: 'image/png' }).catch(() => {})
}
