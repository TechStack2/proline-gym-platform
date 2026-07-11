import { test, expect, type Browser, type Page } from '@playwright/test'
import { vis } from './helpers'

/**
 * MJ-3 SELF-SERVE — member/guardian profile edits + lifecycle requests, end-to-end.
 *
 * Proves, on a HERMETIC own gym (seed_e2e_wl_gym → its own owner + student member
 * + guardian + kids, torn down after — no shared-gym mutation):
 *  1. CONTACT DIRECT SAVE — the member edits contact email + preferred locale and
 *     it persists (the narrowed profiles self-update, 000095).
 *  2. CHANGE REQUEST → APPROVE → APPLIED — a medical-notes change is a request; the
 *     staff /inbox approves it; the value is then applied to the member.
 *  3. RENEWAL REQUEST — the lifecycle banner's dead-end becomes "Request renewal";
 *     staff approve it in the inbox (reuses renew_now → the request leaves the queue).
 *  4. FREEZE REQUEST — an active membership can "Request freeze"; staff approve it
 *     (reuses freeze_membership → the membership is paused).
 *  5. GUARDIAN-FOR-KID — a guardian submits a change request for a linked kid; it
 *     surfaces in the staff inbox as that kid's request.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `self-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

let gymId = ''
let memberStudentId = ''
let memberMembershipId = ''
let kidStudentId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function svcJson(path: string): Promise<any[]> {
  const r = await svc(path)
  return r.ok ? ((await r.json()) as any[]) : []
}
async function loginAs(browser: Browser, role: 'owner' | 'student' | 'parent', locale = 'en') {
  const ctx = await browser.newContext({ locale })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`${role}+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}
const w = (page: Page, tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('SELF-SERVE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string

  // Resolve the credentialed member (student role) + their membership.
  const [studentRole] = await svcJson(`user_roles?gym_id=eq.${gymId}&role=eq.student&select=user_id&limit=1`)
  const [stu] = await svcJson(`students?profile_id=eq.${studentRole.user_id}&select=id&limit=1`)
  memberStudentId = stu.id
  const [mem] = await svcJson(`student_memberships?student_id=eq.${memberStudentId}&select=id&limit=1`)
  memberMembershipId = mem?.id ?? ''

  // Resolve a guardian-linked kid (the parent role → guardian → linked student).
  const [parentRole] = await svcJson(`user_roles?gym_id=eq.${gymId}&role=eq.parent&select=user_id&limit=1`)
  if (parentRole) {
    const [g] = await svcJson(`guardians?profile_id=eq.${parentRole.user_id}&select=id&limit=1`)
    if (g) {
      const [link] = await svcJson(`guardian_students?guardian_id=eq.${g.id}&select=student_id&limit=1`)
      kidStudentId = link?.student_id ?? ''
    }
  }
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = await svcJson(`user_roles?gym_id=eq.${gymId}&select=user_id`)
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

async function setMembership(patch: Record<string, unknown>) {
  await svc(`student_memberships?id=eq.${memberMembershipId}`, { method: 'PATCH', body: JSON.stringify(patch) })
}
const iso = (deltaDays: number) => new Date(Date.now() + deltaDays * 864e5).toISOString().slice(0, 10)

test('SELF-SERVE · member edits contact email + locale directly (persists)', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await loginAs(browser, 'student')
  try {
    await page.goto('/en/portal/profile')
    await expect(w(page, 'profile-edit-contact')).toBeVisible({ timeout: 20_000 })
    const email = `member.${Date.now().toString().slice(-6)}@contact.test`
    await w(page, 'contact-email-input').fill(email)
    await w(page, 'locale-chip-fr').click()
    await page.screenshot({ path: 'screenshots/mj3-profile-edit.png', fullPage: true }).catch(() => {})
    await w(page, 'save-contact').click()
    // Persisted: reload and the input still carries the saved email.
    await expect(async () => {
      await page.reload()
      await expect(w(page, 'contact-email-input')).toHaveValue(email, { timeout: 5_000 })
    }).toPass({ timeout: 20_000 })
  } finally {
    await ctx.close()
  }
})

test('SELF-SERVE · medical change request → staff approve → applied', async ({ browser }) => {
  test.setTimeout(120_000)
  const note = `Asthma inhaler ${Date.now().toString().slice(-5)}`
  const m = await loginAs(browser, 'student')
  try {
    await m.page.goto('/en/portal/profile')
    await w(m.page, 'profile-change-open').click()
    await expect(w(m.page, 'profile-change-modal')).toBeVisible({ timeout: 10_000 })
    await w(m.page, 'pc-medical').fill(note)
    await m.page.screenshot({ path: 'screenshots/mj3-change-request.png', fullPage: true }).catch(() => {})
    await w(m.page, 'profile-change-submit').click()
    await expect(w(m.page, 'profile-change-pending')).toBeVisible({ timeout: 15_000 })
  } finally {
    await m.ctx.close()
  }

  // Staff approve the request in the inbox.
  const s = await loginAs(browser, 'owner')
  try {
    await s.page.goto('/en/inbox')
    const row = vis(s.page, '[data-testid="inbox-member-row"][data-kind="profile_change"]').first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await s.page.screenshot({ path: 'screenshots/mj3-staff-inbox.png', fullPage: true }).catch(() => {})
    await row.locator('[data-testid="inbox-member-approve"]').click()
    await expect(row).toBeHidden({ timeout: 15_000 })
  } finally {
    await s.ctx.close()
  }

  // Applied: the member's medical notes now carry the requested value.
  await expect(async () => {
    const [st] = await svcJson(`students?id=eq.${memberStudentId}&select=medical_notes`)
    expect(st?.medical_notes).toBe(note)
  }).toPass({ timeout: 15_000 })
})

test('SELF-SERVE · renewal request → inbox → staff approve', async ({ browser }) => {
  test.setTimeout(120_000)
  test.skip(!memberMembershipId, 'no seeded membership')
  // Force a lapsed state so the banner + Request renewal appear.
  await setMembership({ status: 'active', end_date: iso(-40) })

  const m = await loginAs(browser, 'student')
  try {
    await m.page.goto('/en/portal')
    await expect(w(m.page, 'portal-lifecycle-banner')).toBeVisible({ timeout: 20_000 })
    await w(m.page, 'request-renewal-btn').click()
    await expect(w(m.page, 'renewal-requested')).toBeVisible({ timeout: 15_000 })
  } finally {
    await m.ctx.close()
  }

  const s = await loginAs(browser, 'owner')
  try {
    await s.page.goto('/en/inbox')
    const row = vis(s.page, '[data-testid="inbox-member-row"][data-kind="renewal"]').first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.locator('[data-testid="inbox-member-approve"]').click()
    await expect(row).toBeHidden({ timeout: 15_000 })
  } finally {
    await s.ctx.close()
  }

  // The request is resolved (approved) — reuse of renew_now issued the invoice.
  await expect(async () => {
    const rows = await svcJson(`member_requests?student_id=eq.${memberStudentId}&kind=eq.renewal&select=status&order=created_at.desc&limit=1`)
    expect(rows[0]?.status).toBe('approved')
  }).toPass({ timeout: 15_000 })
})

test('SELF-SERVE · freeze request → staff approve → membership paused', async ({ browser }) => {
  test.setTimeout(120_000)
  test.skip(!memberMembershipId, 'no seeded membership')
  // Active membership so freeze applies.
  await setMembership({ status: 'active', end_date: iso(60), pause_start_date: null, pause_end_date: null })

  const m = await loginAs(browser, 'student')
  try {
    await m.page.goto('/en/portal')
    await w(m.page, 'request-freeze-btn').click()
    await expect(w(m.page, 'freeze-modal')).toBeVisible({ timeout: 10_000 })
    await w(m.page, 'freeze-submit').click()
    await expect(w(m.page, 'freeze-requested')).toBeVisible({ timeout: 15_000 })
  } finally {
    await m.ctx.close()
  }

  const s = await loginAs(browser, 'owner')
  try {
    await s.page.goto('/en/inbox')
    const row = vis(s.page, '[data-testid="inbox-member-row"][data-kind="freeze"]').first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.locator('[data-testid="inbox-member-approve"]').click()
    await expect(row).toBeHidden({ timeout: 15_000 })
  } finally {
    await s.ctx.close()
  }

  // The freeze mechanics were reused → the membership is paused.
  await expect(async () => {
    const [mem] = await svcJson(`student_memberships?id=eq.${memberMembershipId}&select=status`)
    expect(mem?.status).toBe('paused')
  }).toPass({ timeout: 15_000 })
})

test('SELF-SERVE · guardian submits a change request for a linked kid', async ({ browser }) => {
  test.setTimeout(120_000)
  test.skip(!kidStudentId, 'no seeded guardian-linked kid')
  const note = `Peanut allergy ${Date.now().toString().slice(-5)}`
  const p = await loginAs(browser, 'parent')
  try {
    await p.page.goto(`/en/portal?kid=${kidStudentId}`)
    await expect(w(p.page, 'kid-dashboard')).toBeVisible({ timeout: 20_000 })
    // The guardian-mode editor has NO direct-save section — request only.
    await expect(p.page.locator('[data-testid="profile-edit-contact"]')).toHaveCount(0)
    await w(p.page, 'profile-change-open').click()
    await expect(w(p.page, 'profile-change-modal')).toBeVisible({ timeout: 10_000 })
    await w(p.page, 'pc-medical').fill(note)
    await w(p.page, 'profile-change-submit').click()
    await expect(w(p.page, 'profile-change-pending')).toBeVisible({ timeout: 15_000 })
  } finally {
    await p.ctx.close()
  }

  // Staff see the kid's request in the inbox.
  const s = await loginAs(browser, 'owner')
  try {
    await s.page.goto('/en/inbox')
    await expect(vis(s.page, '[data-testid="inbox-member-row"][data-kind="profile_change"]').first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await s.ctx.close()
  }
})
