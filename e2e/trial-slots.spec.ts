import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * TRIAL-SLOTS — trials book REAL class occurrences & PT availability (field finding 1).
 * Hermetic OWN gym (seed_e2e_wl_gym seeds the Muay Thai class every weekday + Sami).
 *   R2  class-trial occurrence picker: lists real upcoming sessions; a FULL class shows
 *       the overbook hint and is still bookable.
 *   R3  the booked trial rides the coach's attendance sheet for that date, marked TRIAL,
 *       with one-tap check-in.
 *   R4  PT-trial slot picker offers the coach's real availability (class hours excluded).
 *   R5  the lead card shows the booked trial (class name / PT, when).
 *   R6  free — zero invoices created.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `trialslots-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const RUN = String(Date.now()).slice(-6)

let gymId = '', discId = '', samiCoachId = '', memberStudentId = ''
let fullClassId = '', attClassId = '', attCoachEmail = ''
const leadLast = { cls: `TSClass${RUN}`, pt: `TSPt${RUN}`, att: `TSAtt${RUN}` }
const leadId: Record<string, string> = {}

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function svcJson(path: string, body: unknown): Promise<any[]> {
  const r = await svc(path, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`insert ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}
function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function todayDow(): number { return new Date(`${todayISO()}T00:00:00Z`).getUTCDay() }
async function loginAs(browser: Browser, email: string, locale = 'en') {
  const ctx = await browser.newContext({ locale })
  const page = await ctx.newPage()
  await page.goto(`/${locale}/auth/login`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}
/** Open a prospect card + reveal the trial panel. */
async function openTrialPanel(page: Page, last: string) {
  await page.goto(`/en/leads?search=${last}`)
  const card = page.locator(`[data-testid="lead-card"]:visible`).filter({ hasText: last }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.getByRole('button', { name: /Schedule Trial/i }).click()
  return card
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('TRIAL-SLOTS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  discId = ((await (await svc(`disciplines?gym_id=eq.${gymId}&select=id&limit=1`)).json()) as any[])[0].id
  samiCoachId = ((await (await svc(`coaches?gym_id=eq.${gymId}&select=id&limit=1`)).json()) as any[])[0].id
  memberStudentId = ((await (await svc(`students?gym_id=eq.${gymId}&select=id&limit=1`)).json()) as any[])[0].id

  // Three leads (class / pt / attendance flows).
  for (const [k, last] of Object.entries(leadLast)) {
    const rows = await svcJson('leads', { gym_id: gymId, first_name: 'TS', last_name: last, phone: `+9617${RUN}${k === 'cls' ? '1' : k === 'pt' ? '2' : '3'}`, status: 'new', source: 'walk_in' })
    leadId[k] = rows[0].id
  }

  // A FULL class (cap 1, one active reg) scheduled TODAY → overbook hint.
  fullClassId = (await svcJson('classes', { gym_id: gymId, discipline_id: discId, coach_id: samiCoachId, name_ar: 'ممتلئ', name_en: `TS Full ${RUN}`, name_fr: 'Complet', room: 'R', max_capacity: 1, color: '#111', is_active: true }))[0].id
  await svcJson('class_schedules', { class_id: fullClassId, day_of_week: todayDow(), start_time: '20:00', end_time: '21:00', is_active: true })
  await svcJson('class_registrations', { class_id: fullClassId, gym_id: gymId, student_id: memberStudentId, status: 'active' })

  // A coach WITH a login + their own class scheduled today → attendance-sheet check-in.
  attCoachEmail = `tscoach+${SLUG}@e2e.local`
  const cr = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: attCoachEmail, password: PW, email_confirm: true }) })
  const coachUserId = ((await cr.json()) as { id: string }).id
  await svc('profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: coachUserId, gym_id: gymId, first_name_ar: 'مدرب', first_name_en: 'TSCoach', first_name_fr: 'TSCoach', last_name_ar: '.', last_name_en: `${RUN}`, last_name_fr: '.' }) })
  await svc('user_roles', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: coachUserId, gym_id: gymId, role: 'coach' }) })
  const attCoachId = (await svcJson('coaches', { gym_id: gymId, profile_id: coachUserId, specialization_en: 'Trial', specialization_ar: 'تجربة', specialization_fr: 'Essai', is_active: true }))[0].id
  attClassId = (await svcJson('classes', { gym_id: gymId, discipline_id: discId, coach_id: attCoachId, name_ar: 'حضور', name_en: `TS Att ${RUN}`, name_fr: 'Att', room: 'R', max_capacity: 20, color: '#222', is_active: true }))[0].id
  await svcJson('class_schedules', { class_id: attClassId, day_of_week: todayDow(), start_time: '19:00', end_time: '20:00', is_active: true })

  // Sami availability 09:00–17:00 today → PT slots free of the 18:00 Muay Thai class.
  await svcJson('coach_availability', { coach_id: samiCoachId, gym_id: gymId, day_of_week: todayDow(), start_time: '09:00', end_time: '17:00', is_active: true })
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as { user_id: string }[]
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

async function gymInvoiceCount(): Promise<number> {
  return ((await (await svc(`invoices?gym_id=eq.${gymId}&select=id`)).json()) as any[]).length
}

test('TRIAL-SLOTS · class occurrence picker (full → overbook) + roster check-in + zero invoices (en)', async ({ browser }) => {
  test.setTimeout(180_000)
  const invBefore = await gymInvoiceCount()
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`, 'en')
  try {
    // R2 — book the FULL class occurrence → overbook hint, then confirm.
    const card = await openTrialPanel(owner.page, leadLast.cls)
    const occ = card.getByTestId('trial-occurrence')
    await expect(occ, 'the occurrence picker replaced the free datetime').toBeVisible()
    const fullVal = await occ.locator('option', { hasText: `TS Full ${RUN}` }).first().getAttribute('value')
    await occ.selectOption(fullVal as string)
    await expect(card.getByTestId('trial-overbook-hint'), 'a full class shows the overbook hint').toBeVisible()
    await owner.page.screenshot({ path: 'screenshots/trial-slots-picker-en.png' })
    await card.getByTestId('trial-confirm').click()
    await expect(
      owner.page.locator(`[data-testid="lead-card"]:visible`).filter({ hasText: leadLast.cls }).locator('[data-lead-status="trial_scheduled"]').first().or(
        owner.page.locator(`[data-testid="lead-card"][data-lead-status="trial_scheduled"]:visible`).filter({ hasText: leadLast.cls }).first()),
      'the lead flips to trial_scheduled').toBeVisible({ timeout: 20_000 })

    // R5 — the lead card shows WHAT (the class name).
    await expect(owner.page.locator('[data-testid="lead-trial-badge"]:visible').filter({ hasText: `TS Full ${RUN}` }).first()).toBeVisible()

    // The trial pinned the occurrence: class_id + today, free.
    const tr = (await (await svc(`trial_classes?lead_id=eq.${leadId.cls}&select=class_id,scheduled_date,fee_usd,status`)).json()) as any[]
    expect(tr[0].class_id).toBe(fullClassId)
    expect(tr[0].scheduled_date).toBe(todayISO())
    expect(Number(tr[0].fee_usd)).toBe(0)

    // Also book a trial on the attendance-coach's class today (for the roster test).
    const card2 = await openTrialPanel(owner.page, leadLast.att)
    const occ2 = card2.getByTestId('trial-occurrence')
    await occ2.selectOption(await occ2.locator('option', { hasText: `TS Att ${RUN}` }).first().getAttribute('value') as string)
    await card2.getByTestId('trial-confirm').click()
    await expect(owner.page.locator(`[data-testid="lead-card"][data-lead-status="trial_scheduled"]:visible`).filter({ hasText: leadLast.att }).first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await owner.ctx.close()
  }

  // R3 — the coach's attendance sheet shows the TRIAL row for today + one-tap check-in.
  const coach = await loginAs(browser, attCoachEmail, 'en')
  try {
    await coach.page.goto('/en/coach/attendance')
    await expect(coach.page.getByTestId('attendance-class-select')).toBeVisible({ timeout: 15_000 })
    // W3a §2.6: the class <select> became apply-on-tap chips — pick by id.
    await coach.page.locator(`[data-testid="attendance-class-chip"][data-class-id="${attClassId}"]`).click()
    const trialRow = coach.page.locator('[data-testid="attendance-trial-row"]').filter({ hasText: leadLast.att }).first()
    await expect(trialRow, 'the trial rides the roster marked TRIAL').toBeVisible({ timeout: 15_000 })
    await coach.page.screenshot({ path: 'screenshots/trial-slots-roster-en.png' })
    await trialRow.getByTestId('trial-checkin').click()
    await expect(coach.page.locator('[data-testid="attendance-trial-row"][data-trial-status="completed"]').filter({ hasText: leadLast.att }).first(),
      'one-tap check-in marks the trial attended').toBeVisible({ timeout: 15_000 })
  } finally {
    await coach.ctx.close()
  }

  // R6 — trials are FREE: no invoices were created.
  expect(await gymInvoiceCount(), 'a trial creates no invoice').toBe(invBefore)
})

test('TRIAL-SLOTS · PT-trial slot picker excludes class hours (en + ar screenshot)', async ({ browser }) => {
  test.setTimeout(120_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`, 'en')
  try {
    const card = await openTrialPanel(owner.page, leadLast.pt)
    await card.getByTestId('trial-mode-pt').click()
    await card.getByTestId('trial-pt-coach').selectOption({ value: samiCoachId })
    const slot = card.getByTestId('trial-pt-slot')
    await expect(slot, 'the coach has bookable trial slots (real availability)').toBeVisible({ timeout: 15_000 })
    // Availability is 09:00–17:00; the Muay Thai class is 18:00 → no slot at 18:00.
    await expect(slot.locator('option', { hasText: '18:00' })).toHaveCount(0)
    await slot.selectOption(await slot.locator('option').nth(1).getAttribute('value') as string)
    await card.getByTestId('trial-confirm').click()
    await expect(owner.page.locator(`[data-testid="lead-card"][data-lead-status="trial_scheduled"]:visible`).filter({ hasText: leadLast.pt }).first()).toBeVisible({ timeout: 20_000 })
    // PT trial = no class pinned.
    const tr = (await (await svc(`trial_classes?lead_id=eq.${leadId.pt}&select=class_id,assigned_coach_id`)).json()) as any[]
    expect(tr[0].class_id).toBeNull()
    expect(tr[0].assigned_coach_id).toBe(samiCoachId)
  } finally {
    await owner.ctx.close()
  }

  // /ar screenshot of the trial picker (RTL).
  const ownerAr = await loginAs(browser, `owner+${SLUG}@e2e.local`, 'ar')
  try {
    await ownerAr.page.goto(`/ar/leads?search=${leadLast.cls}`)
    const card = ownerAr.page.locator(`[data-testid="lead-card"]:visible`).filter({ hasText: leadLast.cls }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.getByRole('button', { name: /تجربة|Schedule Trial/i }).first().click().catch(() => {})
    await ownerAr.page.screenshot({ path: 'screenshots/trial-slots-picker-ar.png' })
  } finally {
    await ownerAr.ctx.close()
  }
})
