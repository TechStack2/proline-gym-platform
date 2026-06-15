import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis } from './helpers';

/**
 * TEAM-1 — Coach 360 hub + Day Diary floor lens (Cycle 5 / V1).
 *
 * Mirror of the Member-360 win, split into two complementary surfaces:
 *  - Day Diary (floor lens): each coach's column for a day shows the recurring
 *    class slot AND the booked PT AND the open availability gaps (published
 *    coach_availability minus booked = PT-upsell signal); the header links to
 *    that coach's Coach 360.
 *  - Coach 360 (the coach file): header + schedule + availability (staff edit,
 *    persists) + roster (class members + PT clients, each → Member-360) + load.
 *  - Permissions (locked fork): owner + head_coach + RECEPTION manage
 *    availability/assignments/booking; DEACTIVATE is owner/head_coach only —
 *    reception's control is absent; owner's works (re-activated to stay clean).
 *
 * Drives a real PT-2 sale + override booking so the diary/roster read live data.
 */
const COACH_EN = 'Sami';
const SEEDED_CLASS = 'Muay Thai Beginner';
const PACK = '5 Sessions Pack'; // seeded PT package

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}
async function noMissing(page: Page) {
  await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
}

test('TEAM-1 · diary floor lens + Coach 360 hub + reception-manage / owner-deactivate', async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  const reception = await ctxFor(browser, 'reception');
  try {
    // A stable future booking slot (UTC, mirrors pt2 — diary windows are UTC days).
    const target = new Date(Date.now() + 6 * 864e5);
    target.setUTCHours(16, 30, 0, 0);
    const targetIso = target.toISOString();
    const targetDate = targetIso.slice(0, 10);
    const targetDow = target.getUTCDay();

    // ── (owner) Sell a seeded PT pack to Karim WITH Sami → active assignment ──
    await owner.page.goto('/en/students?search=Karim');
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const karimId = owner.page.url().match(/students\/([0-9a-f-]{36})/)![1];
    await vis(owner.page, '[data-testid="pt-sell-open"]').first().click();
    await owner.page.locator('[data-testid="pt-type-chip"]').filter({ hasText: PACK }).first().click();
    await owner.page.locator('[data-testid="pt-coach-chip"]').filter({ hasText: COACH_EN }).first().click();
    await owner.page.getByTestId('pt-sell-submit').click();
    await expect(
      vis(owner.page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: PACK }).first(),
      'the package is sold to Karim with Sami',
    ).toBeVisible({ timeout: 20_000 });

    // ── Reach Coach 360 from the Team list ──
    await owner.page.goto('/en/coaches');
    await vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: COACH_EN }).first().click();
    await expect(owner.page).toHaveURL(/\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const coachId = owner.page.url().match(/coaches\/([0-9a-f-]{36})/)![1];
    const coach360 = `/en/coaches/${coachId}`;

    // ── Coach 360 renders every panel from live data (owner) ──
    await expect(vis(owner.page, '[data-testid="coach-360"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="coach-name"]').first()).toContainText(COACH_EN);
    await expect(vis(owner.page, '[data-testid="panel-coach-schedule"]').first()).toBeVisible();
    await expect(vis(owner.page, '[data-testid="panel-coach-load"]').first()).toBeVisible();
    await expect(
      vis(owner.page, '[data-testid="panel-coach-availability"] [data-testid="availability-editor"]').first(),
      'availability editor renders',
    ).toBeVisible();
    await expect(vis(owner.page, '[data-testid="panel-coach-roster"]').first()).toBeVisible();
    // Schedule shows the seeded recurring class; load counts ≥ 1 class.
    await expect(vis(owner.page, '[data-testid="coach-class-row"]').filter({ hasText: SEEDED_CLASS }).first()).toBeVisible();
    await expect(vis(owner.page, '[data-testid="load-classes"]').first()).not.toHaveText('0');
    // Roster: Karim a PT client + at least one class member, each → Member-360.
    const ptClientLink = vis(owner.page, '[data-testid="coach-roster-pt-client"]').filter({ hasText: 'Karim' }).first();
    await expect(ptClientLink, 'Karim is a PT client of Sami').toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="coach-roster-member"]').first(), 'class roster renders').toBeVisible();
    await noMissing(owner.page);
    await ptClientLink.click();
    await expect(owner.page, 'roster PT client → Member-360').toHaveURL(new RegExp(`/students/${karimId}`), { timeout: 15_000 });

    // ── (reception) MANAGE: availability-edit persists + PT-book; NO deactivate ──
    await reception.page.goto(coach360);
    await expect(vis(reception.page, '[data-testid="coach-360"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(reception.page.locator('[data-testid="coach-deactivate-btn"]'), 'reception sees no deactivate').toHaveCount(0);
    await expect(reception.page.locator('[data-testid="coach-reactivate-btn"]')).toHaveCount(0);

    // Publish a wide window for the target weekday → it persists across reload.
    const editor = vis(reception.page, '[data-testid="availability-editor"]').first();
    await editor.locator(`[data-testid="avail-day-pill"][data-dow="${targetDow}"]`).first().click();
    await editor.locator('[data-testid="avail-start"]').first().fill('14:00');
    await editor.locator('[data-testid="avail-end"]').first().fill('22:00');
    await editor.locator('[data-testid="avail-add"]').first().click();
    await expect(
      editor.locator('[data-testid="avail-row"]').filter({ hasText: '14:00' }).first(),
      'window publishes',
    ).toBeVisible({ timeout: 15_000 });
    await reception.page.reload();
    await expect(
      vis(reception.page, '[data-testid="avail-row"]').filter({ hasText: '14:00' }).first(),
      'window persisted (reception edit through staff RLS)',
    ).toBeVisible({ timeout: 15_000 });

    // Book PT for Karim's assignment (override → exact target slot).
    await vis(reception.page, '[data-testid="coach360-book-pt"] [data-testid="diary-book-pt"]').first().click();
    await reception.page.locator('[data-testid="diary-pt-member-chip"]').filter({ hasText: 'Karim' }).first().click();
    await reception.page.getByTestId('diary-pt-book-open').click();
    await reception.page.getByTestId('pt-override-toggle').check();
    await reception.page.getByTestId('pt-override-at').fill(targetIso.slice(0, 16));
    await reception.page.getByTestId('pt-override-book').click();
    await expect(
      reception.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first(),
      'reception books a PT session',
    ).toBeVisible({ timeout: 15_000 });
    await noMissing(reception.page);

    // ── (owner) Day Diary floor lens: class + booked PT + open gap + Coach-360 link ──
    await owner.page.goto(`/en/schedule?view=day&date=${targetDate}`);
    const samiCol = vis(owner.page, '[data-testid="diary-coach-column"]').filter({ hasText: COACH_EN }).first();
    await expect(samiCol).toBeVisible({ timeout: 15_000 });
    await expect(samiCol.locator('[data-testid="diary-class-block"]').first(), 'class slot on the floor').toBeVisible();
    await expect(samiCol.locator('[data-testid="diary-pt-block"]').first(), 'booked PT on the floor').toBeVisible();
    await expect(samiCol.locator('[data-testid="diary-availability-gap"]').first(), 'open availability gap').toBeVisible();
    await noMissing(owner.page);
    await samiCol.locator('[data-testid="diary-coach-header"]').first().click();
    await expect(owner.page, 'diary header → Coach 360').toHaveURL(new RegExp(`/coaches/${coachId}`), { timeout: 15_000 });

    // ── (owner) DEACTIVATE works (gated) → re-activate to keep the suite clean ──
    await owner.page.goto(coach360);
    await vis(owner.page, '[data-testid="coach-deactivate-btn"]').first().click();
    const warn = vis(owner.page, '[data-testid="coach-deactivate-warning"]').first();
    await expect(warn).toBeVisible();
    await expect(warn, 'seeded coach warns with live obligations').toContainText(/active class/i);
    await vis(owner.page, '[data-testid="coach-deactivate-confirm"]').first().click();
    await expect(owner.page, 'deactivate returns to the team list').toHaveURL(/\/en\/coaches$/, { timeout: 15_000 });
    await expect(
      vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: COACH_EN }),
      'deactivated coach leaves the active list',
    ).toHaveCount(0, { timeout: 15_000 });
    // Re-activate (still reachable by URL) → active again.
    await owner.page.goto(coach360);
    await vis(owner.page, '[data-testid="coach-reactivate-btn"]').first().click();
    await expect(
      vis(owner.page, '[data-testid="coach-active-badge"]').first(),
      'coach re-activated',
    ).toHaveText('Active', { timeout: 15_000 });

    // ── /ar clean on both surfaces (no MISSING_MESSAGE) ──
    await owner.page.goto(`/ar/coaches/${coachId}`);
    await expect(vis(owner.page, '[data-testid="coach-360"]').first()).toBeVisible({ timeout: 15_000 });
    await noMissing(owner.page);
    await owner.page.goto(`/ar/schedule?view=day&date=${targetDate}`);
    await noMissing(owner.page);
  } finally {
    await owner.ctx.close();
    await reception.ctx.close();
  }
});
