import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot, E2E_GYM_SLUG } from './roles';
import { vis, expectNotification } from './helpers';

/**
 * Billing & Payment vertical slice (Cycle 5 / Phase 1 / Prompt D1).
 *
 * Drives the canonical issue → record → reconcile loop as real logins against
 * the ephemeral run gym, and asserts the cross-portal propagation:
 *
 *   T1  owner@ /invoices/new issues an invoice for Karim → issue_invoice runs the
 *       11% TVA/number triggers and fires invoice_issued. Karim (student@) sees
 *       invoice_issued on /notifications and the pending invoice + balance on
 *       /portal/billing. Owner records a PARTIAL payment → status partial, balance
 *       drops; then the REMAINDER → paid + paid_at, lands on the printable
 *       receipt, payment_received reaches Karim, and /portal/billing shows paid.
 *   T2  overpayment is REJECTED (amount > balance) — status unchanged.
 *   T3  dual-currency: an OMT payment in USD+LBP reconciles on amount_usd → paid.
 *   T4  a VOIDED invoice cannot be settled (the settlement form is blocked).
 *
 * Karim is the run gym's student login, so the best-effort notifications LAND
 * (login-aware). Switches roles via fresh contexts from e2e/.auth/*.json.
 */
const RUN = Date.now().toString().slice(-6);

async function ctxFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Issue an invoice for Karim via /invoices/new; returns its number + detail URL. */
async function issueForKarim(owner: Page, amountUsd: number, type = 'membership'): Promise<{ number: string; url: string }> {
  await owner.goto('/en/invoices/new');
  const karim = await owner.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value');
  expect(karim, 'Karim should be in the member dropdown').toBeTruthy();
  await vis(owner, '[data-testid="inv-student"]').selectOption(karim!);
  await vis(owner, '[data-testid="inv-type"]').selectOption(type);
  await vis(owner, '[data-testid="inv-amount-usd"]').fill(String(amountUsd));
  await vis(owner, '[data-testid="issue-submit"]').click();
  // Lands on the invoice detail.
  await expect(vis(owner, '[data-testid="invoice-number"]')).toBeVisible({ timeout: 15_000 });
  const number = (await vis(owner, '[data-testid="invoice-number"]').textContent())!.trim();
  return { number, url: owner.url() };
}

test('D1 · issue → invoice_issued + portal; partial → partial; full → paid + receipt + payment_received', async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student');
  try {
    // ── T1 issue ($100 → $111.00 incl. 11% TVA) ───────────────────────────────
    const { number, url } = await issueForKarim(owner.page, 100);
    await expect(vis(owner.page, '[data-testid="invoice-status"]')).toHaveText(/Pending/i);
    await expect(vis(owner.page, '[data-testid="invoice-total"]')).toHaveText(/111\.00/);
    await expect(vis(owner.page, '[data-testid="invoice-balance"]')).toHaveText(/111\.00/);
    await shot(owner.page, testInfo, 'billing-1-issued');

    // INV-LABEL: the dashboard invoices list shows the type badge (this is a membership invoice).
    await owner.page.goto('/en/invoices');
    const listRow = vis(owner.page, `[data-testid="invoice-row"][data-invoice-number="${number}"]`).first();
    await expect(listRow).toBeVisible({ timeout: 15_000 });
    await expect(listRow.locator('[data-testid="invoice-type-badge"]'), 'dashboard list shows the type label').toHaveText(/Membership/i);

    // Karim sees invoice_issued + the pending invoice with its balance.
    await expectNotification(student.page, 'invoice_issued');
    await student.page.goto('/en/portal/billing');
    const portalRow = vis(student.page, `[data-testid="portal-invoice"][data-invoice-number="${number}"]`).first();
    await expect(portalRow).toBeVisible({ timeout: 15_000 });
    await expect(portalRow).toHaveAttribute('data-status', 'pending');
    await expect(portalRow.locator('[data-testid="portal-invoice-balance"]')).toHaveText(/111\.00/);
    // INV-LABEL: the portal also shows the type badge.
    await expect(portalRow.locator('[data-testid="portal-invoice-type"]'), 'portal shows the type label').toHaveText(/Membership/i);

    // ── partial payment ($40) → partial, balance $71.00 ───────────────────────
    await owner.page.goto(url);
    await vis(owner.page, '[data-testid="pay-amount-usd"]').fill('40');
    await vis(owner.page, '[data-testid="pay-method"]').selectOption('cash_usd');
    await vis(owner.page, '[data-testid="pay-submit"]').click();
    await expect(vis(owner.page, '[data-testid="invoice-status"]')).toHaveText(/Partial/i, { timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="invoice-balance"]')).toHaveText(/71\.00/);

    // ── remainder ($71) → paid, lands on the receipt ──────────────────────────
    await vis(owner.page, '[data-testid="pay-amount-usd"]').fill('71');
    await vis(owner.page, '[data-testid="pay-submit"]').click();
    await expect(vis(owner.page, '[data-testid="receipt"]')).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="receipt-status"]')).toHaveText(/Paid/i);
    await expect(vis(owner.page, '[data-testid="receipt-balance"]')).toHaveText(/0\.00/);
    // INV-LABEL: the receipt shows the type label.
    await expect(vis(owner.page, '[data-testid="receipt-invoice-type"]'), 'receipt shows the type label').toHaveText(/Membership/i);
    await shot(owner.page, testInfo, 'billing-2-receipt');

    // Karim sees payment_received + the invoice now paid, balance $0.00.
    await expectNotification(student.page, 'payment_received');
    await student.page.goto('/en/portal/billing');
    const paidRow = vis(student.page, `[data-testid="portal-invoice"][data-invoice-number="${number}"]`).first();
    await expect(paidRow).toHaveAttribute('data-status', 'paid', { timeout: 15_000 });
    await expect(paidRow.locator('[data-testid="portal-invoice-balance"]')).toHaveText(/0\.00/);
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
  }
});

test('D1 · overpayment is rejected (amount > balance) — status unchanged', async ({ browser }) => {
  test.setTimeout(90_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    const { url } = await issueForKarim(owner.page, 50); // total $55.50
    await owner.page.goto(url);
    await vis(owner.page, '[data-testid="pay-amount-usd"]').fill('100'); // > $55.50
    await vis(owner.page, '[data-testid="pay-submit"]').click();
    await expect(vis(owner.page, '[data-testid="pay-error"]')).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="pay-error"]')).toHaveText(/exceed|overpay/i);
    // Status must NOT have moved.
    await expect(vis(owner.page, '[data-testid="invoice-status"]')).toHaveText(/Pending/i);
    await expect(vis(owner.page, '[data-testid="invoice-balance"]')).toHaveText(/55\.50/);
  } finally {
    await owner.ctx.close();
  }
});

test('D1 · dual-currency: OMT payment (USD + LBP) reconciles on amount_usd → paid', async ({ browser }) => {
  test.setTimeout(90_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    const { url } = await issueForKarim(owner.page, 20); // total $22.20
    await owner.page.goto(url);
    await vis(owner.page, '[data-testid="pay-method"]').selectOption('omt');
    await vis(owner.page, '[data-testid="pay-amount-usd"]').fill('22.20');
    await vis(owner.page, '[data-testid="pay-amount-lbp"]').fill('1975800'); // 22.20 × 89,000
    await vis(owner.page, '[data-testid="pay-reference"]').fill(`OMT-${RUN}`);
    await vis(owner.page, '[data-testid="pay-submit"]').click();
    await expect(vis(owner.page, '[data-testid="receipt"]')).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="receipt-status"]')).toHaveText(/Paid/i);
    await expect(vis(owner.page, '[data-testid="receipt-balance"]')).toHaveText(/0\.00/);
  } finally {
    await owner.ctx.close();
  }
});

test('D1 · a voided invoice cannot be settled (settlement blocked)', async ({ browser }) => {
  test.setTimeout(90_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    const { url } = await issueForKarim(owner.page, 10); // total $11.10
    await owner.page.goto(url);
    // The void flow prompts for a reason — auto-accept.
    owner.page.on('dialog', (d) => d.accept(`e2e void ${RUN}`));
    await vis(owner.page, '[data-testid="void-btn"]').click();
    await expect(vis(owner.page, '[data-testid="invoice-status"]')).toHaveText(/Cancelled/i, { timeout: 15_000 });
    // The settlement form must be blocked (no submit on a cancelled invoice).
    await expect(vis(owner.page, '[data-testid="payment-form"]')).toBeVisible();
    await expect(owner.page.locator('[data-testid="pay-submit"]')).toHaveCount(0);
  } finally {
    await owner.ctx.close();
  }
});

// ── QUICK-WINS #1/#4b — future-dated payments must not inflate "today's" drawer ──
// getDailyTally (daily-tally.ts, #1) and invoices-view todayPays (#4b) both bounded
// the payments query to a true same-day window. Proof: a post-dated (2099) payment is
// EXCLUDED from both drawers, while a same-day payment IS included (positive control,
// so the exclusion isn't a broken measurement). Own-data + full cleanup; svc = service
// role (plain fetch — supabase-js's Realtime client throws on CI Node).
const SVC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function svc(path: string, method = 'GET', body?: unknown): Promise<any> {
  const res = await fetch(`${SVC_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SVC_KEY as string, Authorization: `Bearer ${SVC_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`svc ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Σ of the USD figures in a drawer tally testid (LBP amounts carry no $, so skipped). */
async function tallySumUsd(page: Page, url: string, testid: string): Promise<number> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const el = vis(page, `[data-testid="${testid}"]`).first();
  await expect(el).toBeVisible({ timeout: 15_000 });
  const nums = ((await el.innerText()).match(/\$[\d,]+\.\d{2}/g) ?? []).map((s) => parseFloat(s.replace(/[$,]/g, '')));
  return nums.reduce((s, n) => s + n, 0);
}

test('D1 · QUICK-WINS #1/#4b — a FUTURE-dated payment is EXCLUDED from today\'s drawer tally', async ({ browser }) => {
  test.setTimeout(90_000);
  if (!SVC_URL || !SVC_KEY) throw new Error('QUICK-WINS tally test needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL');
  const { ctx, page } = await ctxFor(browser, 'owner');
  const createdIds: string[] = [];
  try {
    const gym = (await svc(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`))[0];
    const inv = (await svc(`invoices?gym_id=eq.${gym.id}&select=id,student_id&limit=1`))[0];
    expect(inv, 'the run gym has an invoice to attach test payments to').toBeTruthy();

    const day0 = await tallySumUsd(page, '/en/money?tab=invoices', 'daily-tally');
    const today0 = await tallySumUsd(page, '/en/today', 'today-tally');

    // The exact bug: a post-dated (future) payment must NOT enter today's drawer.
    const future = (await svc('payments', 'POST', {
      invoice_id: inv.id, student_id: inv.student_id, amount_usd: 50, amount_lbp: 0,
      payment_method: 'cash_usd', payment_date: '2099-06-01T12:00:00.000Z',
    }))[0];
    createdIds.push(future.id);

    expect(await tallySumUsd(page, '/en/money?tab=invoices', 'daily-tally'),
      '#4b invoices drawer excludes the future-dated payment').toBeCloseTo(day0, 2);
    expect(await tallySumUsd(page, '/en/today', 'today-tally'),
      '#1 today drawer (getDailyTally) excludes the future-dated payment').toBeCloseTo(today0, 2);

    // Positive control: a same-day payment IS counted — proves the tally is live and the
    // measurement can detect a payment, so the exclusions above are meaningful.
    const todayPay = (await svc('payments', 'POST', {
      invoice_id: inv.id, student_id: inv.student_id, amount_usd: 30, amount_lbp: 0,
      payment_method: 'cash_usd', payment_date: new Date().toISOString(),
    }))[0];
    createdIds.push(todayPay.id);
    expect(await tallySumUsd(page, '/en/today', 'today-tally'),
      'a same-day payment IS included (control)').toBeCloseTo(today0 + 30, 2);
  } finally {
    for (const id of createdIds) await svc(`payments?id=eq.${id}`, 'DELETE').catch(() => {});
    await ctx.close();
  }
});
