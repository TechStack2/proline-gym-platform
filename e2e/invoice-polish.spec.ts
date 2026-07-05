import { test, expect } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'
import { vis, createClassViaWizard } from './helpers'

/**
 * INVOICE-POLISH — the printable receipt + the smart label.
 *   (6)  PRINT: under print media the dashboard shell chrome (sidebar/header) is
 *        hidden and only the receipt card shows.
 *   (6b) SMART LABEL: a class-registration invoice (created via the real
 *        approve_class_registration RPC, post-000086) carries an ENRICHED
 *        customer-facing label in notes_* — "<class> — <Month Year>" — rendered on
 *        the receipt. The label localizes: /ar differs from /en (localized month).
 *   (6a) is exercised implicitly — the WA share reads the same notes_* label.
 * /en + /ar. Owner session.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const YEAR = String(new Date().getUTCFullYear())

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

test('INVOICE-POLISH · receipt prints chrome-free + renders the enriched localized label', async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  if (!URL || !KEY) throw new Error('INVOICE-POLISH needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  const CLASS_NAME = `InvPolish ${Date.now()}r${testInfo.retry}`
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    // ── Create a paid-product class + register Karim → the enriched-label RPC issues
    //    a 'class_registration' invoice with notes_* = "<class> — <Month Year>". ──
    await page.goto('/en/classes')
    await createClassViaWizard(page, { nameEn: CLASS_NAME, capacity: '10', fee: '40', presetTime: '19:00' })
    await page.goto('/en/students?search=Karim')
    await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click()
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await vis(page, '[data-testid="m360-register-open"]').first().click()
    await page.locator('[data-testid="m360-class-option"]').filter({ hasText: CLASS_NAME }).first().click()
    await page.getByTestId('m360-register-submit').click()
    await expect(vis(page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: CLASS_NAME }).first(),
      'the registration is active (invoice issued)').toBeVisible({ timeout: 20_000 })

    // ── Locate the freshly-issued invoice (service role). ──
    const gyms = await svcGet(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`)
    const gymId = gyms[0].id
    const invs = await svcGet(`invoices?gym_id=eq.${gymId}&invoice_type=eq.class_registration&order=created_at.desc&limit=1&select=id,notes_en`)
    expect(invs[0]?.id, 'a class_registration invoice exists').toBeTruthy()
    const invId = invs[0].id
    // The DB label is enriched (class name + the year that the plain old "Class: X" lacked).
    expect(invs[0].notes_en, 'notes_en enriched with class + period').toContain(CLASS_NAME)
    expect(invs[0].notes_en, 'notes_en carries the billing period (year)').toContain(YEAR)

    // ── (6b) /en receipt renders the enriched label. ──
    await page.goto(`/en/invoices/${invId}/receipt`)
    const noteEn = vis(page, '[data-testid="receipt-note"]').first()
    await expect(noteEn, 'the receipt renders the label').toBeVisible({ timeout: 15_000 })
    const enText = (await noteEn.textContent())!.trim()
    expect(enText, 'en label = class + period').toContain(CLASS_NAME)
    expect(enText, 'en label carries the period year').toContain(YEAR)

    // ── (6) PRINT: under print media the shell chrome is hidden, the receipt shows. ──
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('desktop-sidebar'), 'sidebar hidden on print').toBeHidden()
    await expect(vis(page, '[data-testid="receipt"]').first(), 'the receipt still shows on print').toBeVisible()
    await page.emulateMedia({ media: 'screen' })

    // ── (6b) /ar receipt renders the LOCALIZED label (differs from /en — Arabic month). ──
    await page.goto(`/ar/invoices/${invId}/receipt`)
    const noteAr = vis(page, '[data-testid="receipt-note"]').first()
    await expect(noteAr, 'the /ar receipt renders the label').toBeVisible({ timeout: 15_000 })
    const arText = (await noteAr.textContent())!.trim()
    expect(arText, 'ar label carries the period year').toContain(YEAR)
    expect(arText, 'ar label is LOCALIZED (differs from en — the month name)').not.toBe(enText)
  } finally {
    await ctx.close()
  }
})
