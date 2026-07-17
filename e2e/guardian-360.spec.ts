import { test, expect, type Browser, type Page } from '@playwright/test'
import { vis } from './helpers'

/**
 * GUARDIAN-360 + FAMILY-VIEW — the family, both sides of the desk. Findings 12+13.
 *
 * On a HERMETIC own gym (seed_e2e_wl_gym → owner + the seeded Rana/Omar/Lina
 * family), extended via service role to a guardian (Rana) with THREE children
 * (Omar + Lina + a LAPSED Sami Jr) PLUS the guardian's own membership (dual-hat):
 *
 *  1. STAFF — the Members area gains a Guardians list (searchable) + a guardian
 *     detail: every dependent's at-a-glance state, the combined family balance,
 *     the lapsed child's win-back dates, per-child jump-to-Member-360, and the
 *     guardian's own card (dual-hat).
 *  2. PORTAL — a 2+-dependent guardian LEADS with the family overview: per child
 *     next class / cycle end / registrations / balance + one combined week
 *     schedule; tap-through to the existing per-child views; `?me=1` → own view.
 *  3. Single-child guardians keep today's behaviour — covered by demo-guardian +
 *     b3 (both retained; a pure single-kid guardian still redirects to the kid).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `g360-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10)

let gymId = ''
let ranaGuardianId = '', ranaProfileId = ''
let omarId = '', linaId = '', samiJrId = '', ranaOwnId = '', classId = ''

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svc(method: string, path: string, body?: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}
async function login(browser: Browser, email: string, locale = 'en') {
  const ctx = await browser.newContext({ locale })
  const page = await ctx.newPage()
  await page.goto(`/${locale}/auth/login`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}
const ownerEmail = () => `owner+${SLUG}@e2e.local`
const ranaEmail = () => `parent+${SLUG}@e2e.local`

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('GUARDIAN-360 needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: 'Fam360 Dojo' }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string

  const [disc] = await svcGet(`disciplines?gym_id=eq.${gymId}&select=id&limit=1`)
  const [coach] = await svcGet(`coaches?gym_id=eq.${gymId}&select=id&limit=1`)
  const [plan] = await svcGet(`membership_plans?gym_id=eq.${gymId}&select=id&limit=1`)

  // The seeded guardian Rana (Mother, is_primary_contact) + her linked kids.
  const [rana] = await svcGet(`guardians?gym_id=eq.${gymId}&select=id,profile_id&order=is_primary_contact.desc&limit=1`)
  ranaGuardianId = rana.id; ranaProfileId = rana.profile_id
  const kidLinks = await svcGet(`guardian_students?guardian_id=eq.${ranaGuardianId}&select=student_id,students:student_id(id,profiles:profile_id(first_name_en))`)
  const kidBy = (nm: string) => kidLinks.find((l: any) => l.students?.profiles?.first_name_en === nm)?.student_id
  omarId = kidBy('Omar') ?? kidLinks[0].student_id
  linaId = kidBy('Lina') ?? kidLinks[1]?.student_id ?? omarId

  // A class with a two-day weekly schedule → the combined family week grid.
  const [cls] = await svc('POST', 'classes', {
    gym_id: gymId, discipline_id: disc.id, coach_id: coach.id,
    name_en: 'Family Class', name_ar: 'صف العائلة', name_fr: 'Cours famille',
    max_capacity: 30, monthly_fee_usd: 40, monthly_fee_lbp: 0, is_active: true,
  })
  classId = cls.id
  for (const d of [1, 3]) await svc('POST', 'class_schedules', { class_id: classId, day_of_week: d, start_time: '18:00', end_time: '19:30', is_active: true })

  const enroll = (studentId: string) => svc('POST', 'class_enrollments', { student_id: studentId, class_id: classId, is_active: true })
  const activeMembership = (studentId: string) => svc('POST', 'student_memberships', { student_id: studentId, plan_id: plan.id, start_date: iso(-10), end_date: iso(20), status: 'active' })

  // Omar — active + enrolled + an OPEN invoice (the family balance + a payable child).
  await enroll(omarId)
  await activeMembership(omarId)
  await svc('POST', 'invoices', {
    gym_id: gymId, student_id: omarId, invoice_type: 'membership', invoice_number: '',
    amount_usd: 40, amount_lbp: 0, tax_rate: 0, total_usd: 40, status: 'pending', due_date: iso(3),
    notes_en: 'G360 open invoice',
  })

  // Lina — active + enrolled (a second child in the combined schedule).
  await enroll(linaId)
  await activeMembership(linaId)

  // Sami Jr — the LAPSED third child (status='lapsed' directly; the churn stamp is
  // BEFORE UPDATE only, so an inserted lapsed row is stable). One old attendance
  // gives the win-back a real "last seen" date.
  const [samiProf] = await svc('POST', 'profiles', {
    gym_id: gymId, first_name_en: 'Sami', first_name_ar: 'سامي', first_name_fr: 'Sami',
    last_name_en: 'Mourad', last_name_ar: 'مراد', last_name_fr: 'Mourad',
    phone: '+9617' + Math.floor(1000000 + Math.random() * 8999999), gender: 'male', date_of_birth: iso(-11 * 365),
  })
  const [samiStu] = await svc('POST', 'students', { profile_id: samiProf.id, gym_id: gymId, current_belt_rank: 'white', is_active: true, join_date: iso(-400) })
  samiJrId = samiStu.id
  await svc('POST', 'guardian_students', { guardian_id: ranaGuardianId, student_id: samiJrId })
  await svc('POST', 'student_memberships', { student_id: samiJrId, plan_id: plan.id, start_date: iso(-120), end_date: iso(-60), status: 'lapsed' })
  await svc('POST', 'attendance_records', { student_id: samiJrId, class_id: classId, attendance_date: iso(-90), status: 'present' })

  // Rana trains too — her OWN student + active membership + enrolment (dual-hat).
  const [ranaStu] = await svc('POST', 'students', { profile_id: ranaProfileId, gym_id: gymId, current_belt_rank: 'blue', is_active: true, join_date: iso(-200) })
  ranaOwnId = ranaStu.id
  await activeMembership(ranaOwnId)
  await enroll(ranaOwnId)
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await svcGet(`user_roles?gym_id=eq.${gymId}&select=user_id`).catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc('DELETE', `gyms?id=eq.${gymId}`).catch(() => {})
})

test('1 · STAFF — Guardians list + search → detail shows 3 dependents, family balance, lapsed win-back, dual-hat', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await login(browser, ownerEmail())
  try {
    // The Members area gains a Guardians tab.
    await page.goto('/en/students')
    await vis(page, '[data-testid="tab-guardians"]').click()
    await expect(page).toHaveURL(/\/students\/guardians$/, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="guardians-view"]')).toBeVisible({ timeout: 15_000 })

    const ranaRow = vis(page, '[data-testid="guardian-list-row"]').filter({ hasText: 'Rana' }).first()
    await expect(ranaRow, 'Rana is listed as a guardian').toBeVisible({ timeout: 15_000 })
    await expect(ranaRow.locator('[data-testid="guardian-row-dependents"]'), '3 dependents').toContainText('3')

    // Search by name narrows; a nonsense query empties.
    await page.locator('[data-testid="guardian-search"]').fill('Rana')
    await page.locator('[data-testid="guardian-search"]').press('Enter')
    await expect(vis(page, '[data-testid="guardian-list-row"]').filter({ hasText: 'Rana' }).first()).toBeVisible({ timeout: 15_000 })
    await page.goto('/en/students/guardians?q=zzznomatch')
    await expect(vis(page, '[data-testid="guardians-empty"]')).toBeVisible({ timeout: 15_000 })

    // Open Rana's family page.
    await page.goto('/en/students/guardians')
    await vis(page, '[data-testid="guardian-list-row"]').filter({ hasText: 'Rana' }).first().click()
    await expect(vis(page, '[data-testid="guardian-detail"]')).toBeVisible({ timeout: 15_000 })
    await expect(vis(page, '[data-testid="guardian-name"]')).toContainText('Rana')

    // Three dependents; the family balance nets Omar's open invoice.
    await expect(vis(page, '[data-testid="guardian-child-card"]')).toHaveCount(3)
    const fam = vis(page, '[data-testid="guardian-family-outstanding"]').first()
    await expect(Number(await fam.getAttribute('data-amount'))).toBeGreaterThan(0)

    // The lapsed child carries a win-back line (last-seen / joined).
    const lapsedCard = vis(page, '[data-testid="guardian-child-card"][data-lapsed="true"]').first()
    await expect(lapsedCard, 'the lapsed child is flagged').toBeVisible()
    await expect(lapsedCard.locator('[data-testid="guardian-child-lastseen"]')).toBeVisible()

    // Dual-hat — the guardian's own membership card is present.
    await expect(vis(page, '[data-testid="guardian-self-card"]')).toBeVisible()

    // Per-child jump to Member-360 works.
    await vis(page, '[data-testid="guardian-child-card"]').filter({ hasText: 'Omar' }).first()
      .locator('[data-testid="guardian-child-360"]').click()
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="member-360"]')).toBeVisible({ timeout: 15_000 })
  } finally { await ctx.close() }
})

test('2 · PORTAL — a 3-dependent guardian leads with the family overview + combined schedule + tap-through + ?me', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await login(browser, ranaEmail())
  try {
    // /portal leads with the family overview (NOT a redirect to a kid).
    await page.goto('/en/portal')
    await expect(vis(page, '[data-testid="family-overview"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('body'), 'i18n keys resolve').not.toContainText('MISSING_MESSAGE')

    // Three child cards + the dual-hat own card + the combined week schedule.
    await expect(vis(page, '[data-testid="family-child-card"]')).toHaveCount(3)
    await expect(vis(page, '[data-testid="family-self-card"]')).toBeVisible()
    await expect(vis(page, '[data-testid="family-week-schedule"]')).toBeVisible()
    await expect(vis(page, '[data-testid="family-week-slot"]').first(), 'the combined schedule has entries').toBeVisible()
    // Owner-specified per-child content is present.
    const omar = vis(page, '[data-testid="family-child-card"]').filter({ hasText: 'Omar' }).first()
    await expect(omar.locator('[data-testid="family-child-nextclass"]')).toBeVisible()
    await expect(omar.locator('[data-testid="family-child-cycle-end"]')).toBeVisible()
    await expect(omar.locator('[data-testid="family-child-regs"]')).toBeVisible()
    await expect(omar.locator('[data-testid="family-child-outstanding"]')).toBeVisible()

    // Tap-through to the existing per-child view.
    await omar.click()
    await expect(page).toHaveURL(/\/portal\?kid=/, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="kid-dashboard"]').first()).toBeVisible({ timeout: 15_000 })
    // From the kid view, the Family chip returns to the overview.
    await vis(page, '[data-testid="family-chip"]').first().click()
    await expect(vis(page, '[data-testid="family-overview"]')).toBeVisible({ timeout: 15_000 })

    // The own dashboard is reachable via ?me=1 (the dual-hat escape).
    await page.goto('/en/portal?me=1')
    await expect(vis(page, '[data-testid="self-view"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(vis(page, '[data-testid="family-chip"]').first(), 'own view links back to family').toBeVisible()
  } finally { await ctx.close() }
})

for (const locale of ['en', 'ar'] as const) {
  test(`shots · ${locale} family overview (desktop + mobile 390) + staff guardian detail`, async ({ browser }) => {
    test.setTimeout(120_000)
    // Portal family home — desktop.
    const g = await login(browser, ranaEmail(), locale)
    try {
      await g.page.goto(`/${locale}/portal`)
      await expect(vis(g.page, '[data-testid="family-overview"]')).toBeVisible({ timeout: 20_000 })
      await g.page.waitForTimeout(400)
      await g.page.screenshot({ path: `screenshots/guardian-360-family-home-${locale}.png`, fullPage: true }).catch(() => {})
    } finally { await g.ctx.close() }

    // Portal family home — mobile 390 (the family overview especially).
    const m = await browser.newContext({ locale, viewport: { width: 390, height: 844 } })
    const mp = await m.newPage()
    try {
      await mp.goto(`/${locale}/auth/login`)
      await mp.locator('#email').fill(ranaEmail())
      await mp.locator('#password').fill(PW)
      await mp.locator('button[type="submit"]').click()
      await mp.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
      await mp.goto(`/${locale}/portal`)
      await expect(vis(mp, '[data-testid="family-overview"]')).toBeVisible({ timeout: 20_000 })
      await mp.waitForTimeout(400)
      await mp.screenshot({ path: `screenshots/guardian-360-family-home-${locale}-mobile.png`, fullPage: true }).catch(() => {})
    } finally { await m.close() }

    // Staff guardian detail — desktop.
    const o = await login(browser, ownerEmail(), locale)
    try {
      await o.page.goto(`/${locale}/students/guardians`)
      await vis(o.page, '[data-testid="guardian-list-row"]').filter({ hasText: locale === 'ar' ? 'رنا' : 'Rana' }).first().click()
      await expect(vis(o.page, '[data-testid="guardian-detail"]')).toBeVisible({ timeout: 15_000 })
      await o.page.waitForTimeout(400)
      await o.page.screenshot({ path: `screenshots/guardian-360-staff-detail-${locale}.png`, fullPage: true }).catch(() => {})
    } finally { await o.ctx.close() }
  })
}
