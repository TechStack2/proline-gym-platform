import { test, expect, type Browser } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'
import { vis } from './helpers'

/**
 * BILL-POLICY (R5) — billing cycles are a per-gym POLICY, and `calendar` actually
 * normalizes onto the month grid.
 *
 *  A. `calendar` — a mid-cycle join prorates a STUB from the start to the next
 *     boundary, AND the next cycle starts ON the boundary. Both are asserted from
 *     the DB (registration anchor / end_date / paid_until + the real invoice in
 *     BOTH currencies), against an INDEPENDENT oracle in this file — never the
 *     app's proration.ts, so the SQL gets a genuine second opinion.
 *  B. `anniversary` — the same join is byte-for-byte today's behavior: anchored on
 *     the member's own start, billed a full month, next cycle a month later. This
 *     is the proof that no live gym changed when 000107 ran.
 *  C. Switching the policy is NOT retroactive — an already-active registration
 *     keeps the anchor and dates it had.
 *
 * ⚠ HERMETIC DISCIPLINE: the run-gym is shared with every other spec FILE that
 * lands on this worker, so the policy is restored to `anniversary` (the seeded
 * default) in afterAll — leaving it on `calendar` would silently re-date every
 * later billing spec's registrations.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svcPost(path: string, body: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svcPatch(path: string, body: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

// ── independent oracle (mirrors the SPEC, not the app code) ──
const iso = (d: Date) => d.toISOString().slice(0, 10)
const today = () => iso(new Date())
function offsetDays(baseISO: string, n: number): string {
  const d = new Date(baseISO + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d)
}
function addMonthsISO(baseISO: string, n: number): string {
  const d = new Date(baseISO + 'T00:00:00Z'); const day = d.getUTCDate()
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(day, last)); return iso(t)
}
/** The cycle-day boundary on/before `onISO` — the oracle twin of _calendar_cycle_anchor. */
function calendarAnchorISO(onISO: string, cycleDay: number): string {
  const d = new Date(onISO + 'T00:00:00Z')
  const same = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), cycleDay))
  return iso(same > d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, cycleDay)) : same)
}
function countSessions(days: number[], fromISO: string, toExclISO: string): number {
  const set = new Set(days); let c = 0
  const cur = new Date(fromISO + 'T00:00:00Z'); const to = new Date(toExclISO + 'T00:00:00Z')
  while (cur < to) { if (set.has(cur.getUTCDay())) c++; cur.setUTCDate(cur.getUTCDate() + 1) }
  return c
}

const MWF = [1, 3, 5]
let gymId: string, disciplineId: string, coachId: string, rate: number

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('BILL-POLICY needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  gymId = (await svcGet(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`))[0].id
  disciplineId = (await svcGet(`disciplines?gym_id=eq.${gymId}&select=id&limit=1`))[0].id
  coachId = (await svcGet(`coaches?gym_id=eq.${gymId}&select=id&limit=1`))[0].id
  const rates = await svcGet(`exchange_rates?gym_id=eq.${gymId}&select=rate&order=rate_date.desc&limit=1`)
  rate = Number(rates[0]?.rate ?? 0)
})

// Always hand the gym back exactly as seeded.
test.afterAll(async () => {
  if (gymId) await svcPatch(`gyms?id=eq.${gymId}`, { billing_cycle_policy: 'anniversary', billing_cycle_day: 1 })
})

async function setPolicy(policy: 'calendar' | 'anniversary', cycleDay = 1) {
  await svcPatch(`gyms?id=eq.${gymId}`, { billing_cycle_policy: policy, billing_cycle_day: cycleDay })
}

async function seedClass(name: string, feeUsd: number, days: number[]): Promise<string> {
  const [cls] = await svcPost('classes', {
    gym_id: gymId, discipline_id: disciplineId, coach_id: coachId,
    name_en: name, name_ar: name, name_fr: name, max_capacity: 20,
    monthly_fee_usd: feeUsd, monthly_fee_lbp: 0, is_active: true,
  })
  for (const d of days) {
    await svcPost('class_schedules', { class_id: cls.id, day_of_week: d, start_time: '18:00', end_time: '19:30', is_active: true })
  }
  return cls.id
}
async function seedStudent(name: string): Promise<{ id: string; display: string }> {
  const [prof] = await svcPost('profiles', {
    gym_id: gymId, first_name_en: name, first_name_ar: name, first_name_fr: name,
    last_name_en: 'Pol', last_name_ar: 'Pol', last_name_fr: 'Pol',
    phone: '+9617' + Math.floor(1000000 + Math.random() * 8999999), gender: 'male',
  })
  const [stu] = await svcPost('students', {
    profile_id: prof.id, gym_id: gymId, current_belt_rank: 'white', belt_promotion_date: today(), is_active: true,
  })
  return { id: stu.id, display: `${name} Pol` }
}

/** Register + approve through the real staff UI, returning the server's today. */
async function registerAndApprove(browser: Browser, classId: string, display: string, startISO?: string) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en/classes/${classId}`)
    const opt = await page.locator('[data-testid="walkin-student"] option', { hasText: display }).first().getAttribute('value')
    await vis(page, '[data-testid="walkin-student"]').selectOption(opt!)
    await vis(page, '[data-testid="walkin-register-btn"]').click()

    const row = vis(page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: display }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    if (startISO) await row.getByTestId('reg-start-date').fill(startISO)

    // R3: the staff sees, BEFORE confirming, what is charged now and when the next
    // bill lands — in both policies.
    await expect(row.getByTestId('reg-charge-now'), 'the preview states the charge now').toBeVisible()
    await expect(row.getByTestId('reg-next-bill'), 'the preview states the next bill').toBeVisible()

    await row.getByTestId('approve-btn').click()
    await expect(vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: display }).first())
      .toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
}

test('A · calendar — a mid-cycle join prorates the STUB and the next cycle starts ON the boundary', async ({ browser }) => {
  test.setTimeout(150_000)

  // Choose a cycle day that guarantees "today" is mid-cycle whatever day the suite
  // runs on: the day before today (clamped to the 1..28 grid), or the 15th when
  // today is the 1st (then the anchor falls in the previous month).
  const dom = new Date(today() + 'T00:00:00Z').getUTCDate()
  const cycleDay = dom >= 2 ? Math.min(28, dom - 1) : 15
  await setPolicy('calendar', cycleDay)

  const CLASS = `BPcal ${Date.now()}`
  const FEE = 60
  const classId = await seedClass(CLASS, FEE, MWF)
  const stu = await seedStudent(`BPcal${Date.now().toString().slice(-5)}`)

  await registerAndApprove(browser, classId, stu.display)

  const [reg] = await svcGet(
    `class_registrations?student_id=eq.${stu.id}&class_id=eq.${classId}` +
    `&select=billing_anchor,start_date,end_date,paid_until,first_cycle_prorated,status`)
  expect(reg.status).toBe('active')

  const invs = await svcGet(
    `invoices?student_id=eq.${stu.id}&invoice_type=eq.class_registration&select=amount_usd,amount_lbp,due_date&order=created_at.desc`)
  expect(invs.length, 'exactly one first invoice').toBe(1)
  const serverToday = offsetDays(String(invs[0].due_date).slice(0, 10), -14) // due_date = CURRENT_DATE + 14

  // ── the boundary claims ──
  const expectedAnchor = calendarAnchorISO(serverToday, cycleDay)
  const boundary = addMonthsISO(expectedAnchor, 1)
  expect(String(reg.billing_anchor), 'anchor snapped to the gym cycle-day boundary').toBe(expectedAnchor)
  expect(new Date(expectedAnchor + 'T00:00:00Z').getUTCDate(), 'the anchor IS the cycle day').toBe(cycleDay)
  expect(String(reg.end_date), 'the first cycle ends ON the next boundary').toBe(boundary)
  expect(String(reg.paid_until), 'the NEXT cycle starts on the boundary').toBe(boundary)

  // ── the stub charge, both currencies, against the independent oracle ──
  const inCycle = countSessions(MWF, expectedAnchor, boundary)
  const remaining = countSessions(MWF, serverToday, boundary)
  expect(remaining, 'a genuine partial cycle').toBeLessThan(inCycle)
  const expectedUsd = Math.round((FEE / inCycle) * remaining * 100) / 100
  expect(Number(invs[0].amount_usd), 'stub = remaining × session value').toBeCloseTo(expectedUsd, 2)
  expect(Boolean(reg.first_cycle_prorated), 'flagged as a prorated first cycle').toBe(true)
  if (rate > 0) {
    expect(Number(invs[0].amount_lbp), 'LBP twin = round(usd × rate)').toBe(Math.round(expectedUsd * rate))
  }
})

test('B · anniversary — the SAME join keeps today\'s behavior (no live gym changed)', async ({ browser }) => {
  test.setTimeout(150_000)
  await setPolicy('anniversary')

  const CLASS = `BPann ${Date.now()}`
  const FEE = 60
  const classId = await seedClass(CLASS, FEE, MWF)
  const stu = await seedStudent(`BPann${Date.now().toString().slice(-5)}`)

  await registerAndApprove(browser, classId, stu.display)

  const [reg] = await svcGet(
    `class_registrations?student_id=eq.${stu.id}&class_id=eq.${classId}` +
    `&select=billing_anchor,end_date,paid_until,first_cycle_prorated`)
  const invs = await svcGet(
    `invoices?student_id=eq.${stu.id}&invoice_type=eq.class_registration&select=amount_usd,amount_lbp,due_date&order=created_at.desc`)
  expect(invs.length).toBe(1)
  const serverToday = offsetDays(String(invs[0].due_date).slice(0, 10), -14)

  // The pre-BILL-POLICY anchor: the first scheduled session on/after the start.
  let expectedAnchor = serverToday
  for (let i = 0; i < 7; i++) {
    const cand = offsetDays(serverToday, i)
    if (MWF.includes(new Date(cand + 'T00:00:00Z').getUTCDay())) { expectedAnchor = cand; break }
  }
  expect(String(reg.billing_anchor), 'anchored on the member, not the month grid').toBe(expectedAnchor)
  expect(String(reg.end_date), 'cycle runs a month from the member’s own anchor').toBe(addMonthsISO(expectedAnchor, 1))
  // A fresh anniversary registration has nothing to prorate — it pays a full month.
  expect(Number(invs[0].amount_usd), 'full month, never a silent stub').toBeCloseTo(FEE, 2)
  expect(Boolean(reg.first_cycle_prorated)).toBe(false)
})

test('C · switching the policy is NOT retroactive — an active registration keeps its dates', async ({ browser }) => {
  test.setTimeout(150_000)
  await setPolicy('anniversary')

  const CLASS = `BPswitch ${Date.now()}`
  const classId = await seedClass(CLASS, 40, MWF)
  const stu = await seedStudent(`BPsw${Date.now().toString().slice(-5)}`)
  await registerAndApprove(browser, classId, stu.display)

  const sel = `class_registrations?student_id=eq.${stu.id}&class_id=eq.${classId}` +
              `&select=billing_anchor,start_date,end_date,paid_until,first_cycle_prorated`
  const [before] = await svcGet(sel)

  // Flip the gym onto the month grid AFTER the member is active.
  await setPolicy('calendar', 1)
  const [after] = await svcGet(sel)

  expect(after, 'no stored cycle field is rewritten by a policy switch').toEqual(before)
})
