import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * DUNNING-AUTO — auto WhatsApp renewal reminders (opt-in, deduped, record-mode).
 *
 * Two isolated gyms (service-role seed seed_e2e_dunning) each with an OVERDUE open
 * renewal invoice + active WhatsApp: one OPTED-IN, one OPTED-OUT. Drives the
 * invocable trigger (POST /api/dunning/run, staff session) and asserts:
 *   · opted-in  → exactly ONE reminder recorded (outbound_messages, template dunning_*)
 *   · second run → NO duplicate (dedup)
 *   · opted-out → ZERO auto-sends
 * Record mode (WHATSAPP_PROVIDER_MODE=record) — no external Meta call.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG_IN = `dun-in-${BASE}`
const SLUG_OUT = `dun-out-${BASE}`

let gymIn = ''
let gymOut = ''

async function seed(slug: string, optIn: boolean): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_dunning`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug, p_opt_in: optIn, p_password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`seed_e2e_dunning(${slug}) failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string // the gym UUID
}

async function dunRows(gymId: string): Promise<Array<{ template: string; dedup_key: string; status: string }>> {
  const res = await fetch(
    `${URL}/rest/v1/outbound_messages?gym_id=eq.${gymId}&template=like.dunning*&select=template,dedup_key,status`,
    { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } },
  )
  if (!res.ok) throw new Error(`outbound read failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as any[]
}

async function ownerCtx(browser: Browser, slug: string) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${slug}@e2e.local`)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

/** POST the invocable trigger with the page's (owner) session cookies. */
async function runDunning(page: Page) {
  const res = await page.request.post('/api/dunning/run')
  expect(res.ok(), `run returned ${res.status()}`).toBeTruthy()
  return (await res.json()) as { ok: boolean; considered: number; sent: number; deduped: number; failed: number }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('DUNNING-AUTO needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  gymIn = await seed(SLUG_IN, true)
  gymOut = await seed(SLUG_OUT, false)
})

test('DUNNING-AUTO · opted-in gym auto-sends ONE reminder + a second run does NOT duplicate (dedup)', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser, SLUG_IN)
  try {
    // First run: the overdue renewal produces exactly one reminder.
    const r1 = await runDunning(page)
    expect(r1.considered, 'one due reminder considered').toBeGreaterThanOrEqual(1)
    expect(r1.sent, 'one reminder auto-sent').toBeGreaterThanOrEqual(1)
    const rows1 = await dunRows(gymIn)
    expect(rows1.length, 'exactly one dunning reminder recorded').toBe(1)
    expect(rows1[0].dedup_key, 'the reminder carries its dedup key').toMatch(/^dun_/)

    // Second run: nothing new — the reader excludes the already-sent key (dedup).
    const r2 = await runDunning(page)
    expect(r2.sent, 'the second run sends nothing new').toBe(0)
    expect(r2.considered, 'the already-sent reminder is not re-considered').toBe(0)
    const rows2 = await dunRows(gymIn)
    expect(rows2.length, 'still exactly one reminder (no duplicate)').toBe(1)
  } finally {
    await ctx.close()
  }
})

test('DUNNING-AUTO · opted-OUT gym auto-sends NOTHING (safety rail)', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser, SLUG_OUT)
  try {
    const r = await runDunning(page)
    expect(r.considered, 'an opted-out gym has zero due reminders').toBe(0)
    expect(r.sent, 'an opted-out gym auto-sends nothing').toBe(0)
    const rows = await dunRows(gymOut)
    expect(rows.length, 'zero reminders recorded for an opted-out gym').toBe(0)
  } finally {
    await ctx.close()
  }
})
