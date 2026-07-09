import { test, expect, type Browser, type Page } from '@playwright/test';
import { vis, untilConsistent } from './helpers';

/**
 * PT-POLICY (M2-D; union-hardened to a HERMETIC own-gym) — PtPolicySettings writes
 * gyms.pt_late_cancel_window_hours; this spec proves a SET policy field BITES where the
 * platform reads it: the member self-cancel guard in the cancel_pt_booking RPC (000045).
 * Set a large late-cancel window via the Settings UI → book a PT slot → the member's
 * cancel now falls INSIDE the window → the RPC blocks it (P0001 prose passes through to a
 * toast) and the session stays scheduled.
 *
 * WHY HERMETIC (g1 pattern): pt_late_cancel_window_hours is a GYM-WIDE setting and the
 * flow SELLS + BOOKS on a coach roster. On the shared per-worker seed gym those writes
 * perturb the sibling PT specs (pt1/pt2/pt-delivery) that share the same coach (Sami) +
 * member (Karim) — and are perturbed BY them (the union-order sell-warn flake). So this
 * spec seeds its OWN gym via seed_e2e_wl_gym and logs in as THAT gym's own owner/coach/
 * student: the policy write + the sale/booking touch only this gym, so no sibling can be
 * perturbed and none can perturb us. The gym (+ its auth users) is torn down after.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23';
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local';
const SLUG = `ptpol-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`;
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
let gymId = '';

const uniq = () => Date.now().toString().slice(-6);

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
}

/** Log into the seeded gym as one of its per-slug users (owner/coach/student). */
async function loginAs(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: 'en' });
  const page = await ctx.newPage();
  await page.goto('/en/auth/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PW);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 });
  return { ctx, page };
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('PT-POLICY needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL');
  // A fully-configured own gym (coach + PT + members), branded so no unrelated setup
  // surface interferes. Seed is idempotent (drops prior %+slug users first).
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_slug: SLUG, p_brand_color: '#cd1419', p_name: null }),
  });
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`);
  gymId = (await res.json()) as string;
});

test.afterAll(async () => {
  if (!gymId) return;
  // Delete the gym's auth users first — DELETE gyms cascades roles/profiles/students but
  // NOT auth.users, and a lingering owner email would 409 a future same-slug seed.
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>;
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {});
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {});
});

async function ensureAvailability(coachPage: Page) {
  await coachPage.goto('/en/coach/pt');
  await expect(vis(coachPage, '[data-testid="availability-editor"]').first()).toBeVisible({ timeout: 20_000 });
  if ((await vis(coachPage, '[data-testid="avail-row"]').count()) >= 7) return;
  for (let d = 0; d <= 6; d++) {
    if ((await vis(coachPage, `[data-testid="avail-row"][data-dow="${d}"]`).count()) > 0) continue;
    await vis(coachPage, `[data-testid="avail-day-pill"][data-dow="${d}"]`).first().click();
    await vis(coachPage, '[data-testid="avail-start"]').first().fill('08:00');
    await vis(coachPage, '[data-testid="avail-end"]').first().fill('20:00');
    await vis(coachPage, '[data-testid="avail-add"]').first().click();
    await expect(vis(coachPage, `[data-testid="avail-row"][data-dow="${d}"]`).first()).toBeVisible({ timeout: 15_000 });
  }
}

// createType via the M2-D FormWizard (add-btn OPENS; Basics → Details).
async function createType(page: Page, name: string) {
  await page.goto('/en/settings?tab=ptpackages');
  await vis(page, '[data-testid="ptpkg-add-btn"]').click();
  await vis(page, '[data-testid="ptpkg-add-en"]').fill(name);
  await vis(page, '[data-testid="wizard-next"]').click();
  await vis(page, '[data-testid="ptpkg-add-sessions"]').fill('10');
  await vis(page, '[data-testid="ptpkg-add-price"]').fill('100');
  await vis(page, '[data-testid="ptpkg-add-validity"]').fill('60');
  await vis(page, '[data-testid="wizard-submit"]').click();
  await expect(vis(page, `[data-testid="ptpkg-row"][data-name-en="${name}"]`).first()).toBeVisible({ timeout: 15_000 });
}

// Sell the pack to the gym's seeded member (Karim). This gym has a single seeded coach
// with the availability set above, so the coach chip is unambiguous (no sibling-created
// login-less coach to trip the J3 no-availability warn).
async function sellToMember(page: Page, typeName: string) {
  await page.goto('/en/students?search=Karim');
  await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await vis(page, '[data-testid="pt-sell-open"]').first().click();
  await page.locator('[data-testid="pt-type-chip"]').filter({ hasText: typeName }).first().click();
  await page.locator('[data-testid="pt-coach-chip"]').first().click();
  await page.getByTestId('pt-sell-submit').click();
  // Backstop (harmless in the single-coach gym): click through the warn-and-allow modal
  // if the availability count query ever races to zero.
  await page.getByTestId('pt-sell-anyway').click({ timeout: 3_000 }).catch(() => {});
  await expect(vis(page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: typeName }).first())
    .toBeVisible({ timeout: 20_000 });
}

function portalCard(page: Page, name: string) {
  return page.locator('[data-testid="pt-my-request"]').filter({ hasText: name }).first();
}

// Set the late-cancel window via the Settings PT-policy UI (offers section).
async function setLateCancelWindow(page: Page, hours: string) {
  await page.goto('/en/settings?tab=ptpackages');
  await vis(page, '[data-testid="pt-late-cancel-window"]').first().fill(hours);
  await vis(page, '[data-testid="pt-policy-save"]').first().click();
}

test('PT-POLICY · a set late-cancel window blocks the member cancel guard', async ({ browser }) => {
  test.setTimeout(300_000);
  const PACK = `Policy Pack ${uniq()}`;
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`);
  const coach = await loginAs(browser, `coach+${SLUG}@e2e.local`);
  const student = await loginAs(browser, `student+${SLUG}@e2e.local`);
  try {
    await ensureAvailability(coach.page);
    await createType(owner.page, PACK);
    await sellToMember(owner.page, PACK);

    // ── Member books the nearest slot under the default policy (window still 0 — a
    //    booking is never itself gated). ──
    const slots = student.page.locator('[data-testid="pt-slot"]');
    await untilConsistent(async () => {
      await student.page.goto('/en/portal/pt');
      await portalCard(student.page, PACK).getByTestId('pt-book-open').click();
      await expect(slots.first()).toBeVisible({ timeout: 6_000 });
    }, { timeout: 45_000 });
    await slots.first().click();
    await expect(student.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
      .toBeVisible({ timeout: 15_000 });

    // ── Raise the late-cancel window (720h > the booking horizon) so the freshly booked
    //    session falls INSIDE it — proving the UI write reaches gyms.pt_* and that the
    //    member self-cancel guard reads it. ──
    await setLateCancelWindow(owner.page, '720');

    // ── The booked session is scheduled + INSIDE the window → member cancel is blocked.
    //    Re-read the portal so the card reflects state after the policy change. ──
    await student.page.goto('/en/portal/pt');
    const session = portalCard(student.page, PACK).locator('[data-testid="portal-pt-session"][data-status="scheduled"]').first();
    await expect(session).toBeVisible({ timeout: 15_000 });
    await session.getByTestId('pt-cancel-booking').click();
    // The cancel_pt_booking guard RAISEs the window message (P0001 prose → toast verbatim).
    await expect(
      student.page.getByText(/cancellation window|contact the desk/i).first(),
      'the late-cancel window blocks the member self-cancel',
    ).toBeVisible({ timeout: 15_000 });
    // Credits untouched, session still scheduled (no write happened).
    await expect(
      portalCard(student.page, PACK).locator('[data-testid="portal-pt-session"][data-status="scheduled"]').first(),
      'the session stays scheduled after the blocked cancel',
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    // No policy reset needed — the whole gym is torn down in afterAll.
    await owner.ctx.close();
    await coach.ctx.close();
    await student.ctx.close();
  }
});
