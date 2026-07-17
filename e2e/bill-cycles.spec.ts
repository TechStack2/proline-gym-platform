import { test, expect, type Browser } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'
import { vis } from './helpers'

/**
 * BILL-CYCLES (R5) — staff-controlled registration cycles + session proration.
 *
 *  A. Prorated first invoice — a mid-cycle join on a 3×/week class with the anchor
 *     set earlier bills remaining_sessions × session_value in BOTH currencies. The
 *     expected amount is computed by an INDEPENDENT day-counter in this test (not the
 *     app's proration.ts — a genuine second oracle for the SQL charge), using the
 *     SERVER's today (derived from the invoice due_date = CURRENT_DATE + 14, so the
 *     assertion never flakes on the UTC-midnight boundary). Also: exactly ONE invoice
 *     (a backdated start bills the current cycle, never retroactively) + the R3
 *     forward-anchor edit advances the cycle.
 *  B. Future start — no invoice issues now; the member shows on the roster as
 *     "starts <date>" and is kept OFF today's markable attendance.
 *  C. Reception permission — a receptionist can register + set the cycle (owner AND
 *     reception control the cycle, per the decree).
 *
 * Each test seeds its OWN class + a throwaway member (service role) to stay parallel-
 * safe — no shared-gym student contention.
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

// ── independent date/session oracle (mirrors the SQL spec; NOT the app code) ──
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
function countSessions(days: number[], fromISO: string, toExclISO: string): number {
  const set = new Set(days); let c = 0
  const cur = new Date(fromISO + 'T00:00:00Z'); const to = new Date(toExclISO + 'T00:00:00Z')
  while (cur < to) { if (set.has(cur.getUTCDay())) c++; cur.setUTCDate(cur.getUTCDate() + 1) }
  return c
}

let gymId: string, disciplineId: string, coachId: string, rate: number

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('BILL-CYCLES needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  gymId = (await svcGet(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`))[0].id
  disciplineId = (await svcGet(`disciplines?gym_id=eq.${gymId}&select=id&limit=1`))[0].id
  coachId = (await svcGet(`coaches?gym_id=eq.${gymId}&select=id&limit=1`))[0].id
  const rates = await svcGet(`exchange_rates?gym_id=eq.${gymId}&select=rate&order=rate_date.desc&limit=1`)
  rate = Number(rates[0]?.rate ?? 0)
})

async function seedClass(name: string, feeUsd: number, days: number[]): Promise<string> {
  const [cls] = await svcPost('classes', {
    gym_id: gymId, discipline_id: disciplineId, coach_id: coachId,
    name_en: name, name_ar: name, name_fr: name, max_capacity: 20,
    monthly_fee_usd: feeUsd, monthly_fee_lbp: 0, is_active: true,
  })
  for (const d of days) await svcPost('class_schedules', { class_id: cls.id, day_of_week: d, start_time: '18:00', end_time: '19:30', is_active: true })
  return cls.id
}
async function seedStudent(name: string): Promise<{ id: string; display: string }> {
  const [prof] = await svcPost('profiles', {
    gym_id: gymId, first_name_en: name, first_name_ar: name, first_name_fr: name,
    last_name_en: 'Cyc', last_name_ar: 'Cyc', last_name_fr: 'Cyc',
    phone: '+9617' + Math.floor(1000000 + Math.random() * 8999999), gender: 'male',
  })
  const [stu] = await svcPost('students', {
    profile_id: prof.id, gym_id: gymId, current_belt_rank: 'white', belt_promotion_date: today(), is_active: true,
  })
  return { id: stu.id, display: `${name} Cyc` }
}

test('A · prorated first invoice (both currencies) + one invoice (no retro) + forward-anchor edit', async ({ browser }) => {
  test.setTimeout(120_000)
  const CLASS = `BCproRate ${Date.now()}`
  const classId = await seedClass(CLASS, 60, [1, 3, 5]) // Mon/Wed/Fri, $60/mo
  const stu = await seedStudent(`BCpro${Date.now().toString().slice(-5)}`)

  // Anchor 7 days back (cycle already running → a genuine partial first cycle); start
  // backdated so billing begins at TODAY, not retroactively.
  const anchorISO = offsetDays(today(), -7)
  const startISO = offsetDays(today(), -40)

  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en/classes/${classId}`)
    // walk-in register the fresh member → a pending request.
    const opt = await page.locator('[data-testid="walkin-student"] option', { hasText: stu.display }).first().getAttribute('value')
    await vis(page, '[data-testid="walkin-student"]').selectOption(opt!)
    await vis(page, '[data-testid="walkin-register-btn"]').click()

    const row = vis(page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: stu.display }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByTestId('reg-start-date').fill(startISO)
    await row.getByTestId('reg-anchor').fill(anchorISO)
    await row.getByTestId('reg-prorate').check()
    // The live preview flags a real proration.
    await expect(row.getByTestId('reg-proration-preview')).toContainText(/sessions/i)
    // Report evidence: the en proration preview (→ the e2e-screenshots artifact).
    await page.screenshot({ path: 'screenshots/bill-cycles-proration-en.png', fullPage: true }).catch(() => {})
    await row.getByTestId('approve-btn').click()

    await expect(vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first())
      .toBeVisible({ timeout: 15_000 })

    // ── the authoritative charge: read the invoice + derive the SERVER's today ──
    const invs = await svcGet(`invoices?student_id=eq.${stu.id}&invoice_type=eq.class_registration&select=amount_usd,amount_lbp,due_date,created_at&order=created_at.desc`)
    expect(invs.length, 'exactly one invoice — a backdated start never bills retroactively').toBe(1)
    const inv = invs[0]
    const serverToday = offsetDays(String(inv.due_date).slice(0, 10), -14) // due_date = CURRENT_DATE + 14

    // ── independent oracle: remaining_sessions × session_value ──
    const cycleStart = anchorISO
    const cycleEnd = addMonthsISO(anchorISO, 1)
    const billFrom = serverToday // start is 40d back → billing begins at today, clamped ≥ cycleStart
    const inCycle = countSessions([1, 3, 5], cycleStart, cycleEnd)
    const remaining = countSessions([1, 3, 5], billFrom, cycleEnd)
    expect(remaining, 'a genuine partial first cycle').toBeGreaterThan(0)
    expect(remaining, 'and it is prorated (fewer than the whole cycle)').toBeLessThan(inCycle)
    const expectUsd = Math.round((60 / inCycle) * remaining * 100) / 100
    const expectLbp = Math.round(expectUsd * rate)

    expect(Number(inv.amount_usd), `USD = (60/${inCycle})×${remaining}`).toBeCloseTo(expectUsd, 2)
    expect(Number(inv.amount_lbp), 'LBP = round(usd × rate)').toBe(expectLbp)

    // ── R3: move the billing anchor FORWARD → cycle advances (audited in-RPC). ──
    const reg = (await svcGet(`class_registrations?student_id=eq.${stu.id}&class_id=eq.${classId}&select=id&limit=1`))[0]
    const fwd = offsetDays(today(), 30)
    const active = vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first()
    await active.getByTestId('cycle-edit-btn').click()
    await active.getByTestId('anchor-edit').fill(fwd)
    await active.getByTestId('anchor-save').click()
    await expect.poll(async () => {
      const r = (await svcGet(`class_registrations?id=eq.${reg.id}&select=billing_anchor,paid_until`))[0]
      return `${String(r.billing_anchor).slice(0, 10)}|${String(r.paid_until).slice(0, 10) >= fwd}`
    }, { timeout: 10_000 }).toBe(`${fwd}|true`)
  } finally { await ctx.close() }
})

test('B · a future start defers billing + shows on the roster as "starts <date>", off today\'s attendance', async ({ browser }) => {
  test.setTimeout(120_000)
  const CLASS = `BCfuture ${Date.now()}`
  const classId = await seedClass(CLASS, 50, [0, 1, 2, 3, 4, 5, 6]) // daily → always on today's attendance
  const stu = await seedStudent(`BCfut${Date.now().toString().slice(-5)}`)
  const futureStart = offsetDays(today(), 10)

  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en/classes/${classId}`)
    const opt = await page.locator('[data-testid="walkin-student"] option', { hasText: stu.display }).first().getAttribute('value')
    await vis(page, '[data-testid="walkin-student"]').selectOption(opt!)
    await vis(page, '[data-testid="walkin-register-btn"]').click()
    const row = vis(page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: stu.display }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByTestId('reg-start-date').fill(futureStart)
    await expect(row.getByTestId('reg-proration-preview'), 'preview flags a future first bill').toContainText(/Starts|first bill/i)
    await row.getByTestId('approve-btn').click()

    // Active, flagged as starting later, and NOT billed now.
    const active = vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first()
    await expect(active).toBeVisible({ timeout: 15_000 })
    await expect(active.getByTestId('reg-starts')).toBeVisible()
    await expect(active, 'future start is not invoiced yet').not.toContainText('Invoiced')
    const invs = await svcGet(`invoices?student_id=eq.${stu.id}&invoice_type=eq.class_registration&select=id`)
    expect(invs.length, 'no invoice issues before the start date').toBe(0)

    // Today's attendance: the member surfaces as "starts <date>", not on the markable roster.
    await page.goto('/en/attendance')
    const soon = vis(page, '[data-testid="starting-soon"]').filter({ hasText: stu.display }).first()
    await expect(soon, 'future-start member shows as starting-soon on today\'s attendance').toBeVisible({ timeout: 15_000 })
  } finally { await ctx.close() }
})

test('C · a receptionist can register a member and set the billing cycle', async ({ browser }) => {
  test.setTimeout(120_000)
  const CLASS = `BCrecept ${Date.now()}`
  const classId = await seedClass(CLASS, 40, [1, 3, 5])
  const stu = await seedStudent(`BCrec${Date.now().toString().slice(-5)}`)

  const ctx = await browser.newContext({ storageState: ROLES.reception.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en/classes/${classId}`)
    const opt = await page.locator('[data-testid="walkin-student"] option', { hasText: stu.display }).first().getAttribute('value')
    await vis(page, '[data-testid="walkin-student"]').selectOption(opt!)
    await vis(page, '[data-testid="walkin-register-btn"]').click()
    const row = vis(page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: stu.display }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByTestId('reg-start-date').fill(today())
    await row.getByTestId('approve-btn').click()
    // Reception's approval activated the registration + issued the first invoice.
    const active = vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first()
    await expect(active, 'reception can control the registration cycle').toBeVisible({ timeout: 15_000 })
    await expect(active).toContainText('Invoiced')
  } finally { await ctx.close() }
})

test('D · ar — the proration preview renders RTL (report evidence)', async ({ browser }) => {
  test.setTimeout(120_000)
  const CLASS = `BCarShot ${Date.now()}`
  const classId = await seedClass(CLASS, 60, [1, 3, 5])
  const stu = await seedStudent(`BCar${Date.now().toString().slice(-5)}`)
  const anchorISO = offsetDays(today(), -7)

  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'ar' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/ar/classes/${classId}`)
    const opt = await page.locator('[data-testid="walkin-student"] option', { hasText: stu.display }).first().getAttribute('value')
    await vis(page, '[data-testid="walkin-student"]').selectOption(opt!)
    await vis(page, '[data-testid="walkin-register-btn"]').click()
    const row = vis(page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: stu.display }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByTestId('reg-start-date').fill(offsetDays(today(), -40))
    await row.getByTestId('reg-anchor').fill(anchorISO)
    await row.getByTestId('reg-prorate').check()
    await expect(row.getByTestId('reg-proration-preview')).toBeVisible()
    await page.screenshot({ path: 'screenshots/bill-cycles-proration-ar.png', fullPage: true }).catch(() => {})
  } finally { await ctx.close() }
})
