import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * F3 — Waiver / consent record + signature capture. Four proofs:
 *  1. TEMPLATE: the seeded waiver is readable to a member in-gym; a staff body
 *     edit bumps the version.
 *  2. SIGN (member): the member signs (canvas + typed name + agree checkbox) →
 *     a waiver_signatures row (right student/version) + the artifact persists →
 *     Member-360 + portal show "Signed v N".
 *  3. GUARDIAN signs for a minor → the signed record on the kid's Member-360
 *     shows the GUARDIAN as signer (signed_by = guardian, student = kid).
 *  4. OUTDATED: bump the version → the member flips to Outdated + re-signs →
 *     a new row → back to Signed (append-only).
 *
 * Storage choice: the signature artifact is a base64 PNG data-URL kept IN THE
 * ROW; the Member-360 thumbnail asserts it persisted + round-trips.
 */
async function ctxFor(browser: Browser, role: keyof typeof ROLES, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale })
  return { ctx, page: await ctx.newPage() }
}

/** Draw a stroke on the visible signature pad, type a name, agree, submit. */
async function signFlow(page: Page, prefix: string, name: string) {
  await vis(page, `[data-testid="${prefix}-sign-open"]`).first().click()
  const modal = vis(page, `[data-testid="${prefix}-sign-modal"]`).first()
  await expect(modal).toBeVisible({ timeout: 10_000 })
  await expect(modal.getByTestId('waiver-body'), 'the member reads the waiver text').not.toBeEmpty()

  // The pad must be visible + settled before the pointer stream lands on it.
  const canvas = modal.getByTestId('signature-pad')
  await expect(canvas, 'the signature pad is visible').toBeVisible()
  await canvas.scrollIntoViewIfNeeded()

  // Draw a centred multi-segment stroke and RE-DRAW until the pad registers ink.
  // The draw is idempotent (more strokes keep data-has-ink true) and mutates no
  // server state, so re-running only the INTERACTION — never a weakened assertion
  // — pins the residual canvas-draw timing flake. `steps` emits intermediate
  // pointermove events so a single segment can't be dropped.
  await expect
    .poll(
      async () => {
        const box = await canvas.boundingBox()
        if (!box) return 'false'
        const cx = box.x + box.width / 2
        const cy = box.y + box.height / 2
        await page.mouse.move(cx - 70, cy - 30)
        await page.mouse.down()
        await page.mouse.move(cx - 20, cy + 35, { steps: 12 })
        await page.mouse.move(cx + 35, cy - 25, { steps: 12 })
        await page.mouse.move(cx + 80, cy + 30, { steps: 12 })
        await page.mouse.up()
        return canvas.getAttribute('data-has-ink')
      },
      { timeout: 10_000, message: 'the pad captured ink' },
    )
    .toBe('true')

  await modal.getByTestId('waiver-typed-name').fill(name)
  await modal.getByTestId('waiver-agree').check()
  await modal.getByTestId('waiver-submit').click()
  await expect(modal, 'the modal closes on a successful sign').toBeHidden({ timeout: 20_000 })
}

/** Staff: edit the waiver body in Settings → the version bumps. */
async function bumpWaiverBody(page: Page, newBodyEn: string) {
  await page.goto('/en/settings?tab=comms') // J5b: waiver card re-homed to the comms tab
  await vis(page, '[data-testid="wv-edit-open"]').first().click()
  const ed = vis(page, '[data-testid="waiver-editor"]').first()
  await expect(ed).toBeVisible({ timeout: 10_000 })
  await ed.getByTestId('wizard-next').click() // title → body
  await ed.getByTestId('wv-body-en').fill(newBodyEn)
  await ed.getByTestId('wizard-next').click() // body → activate
  await expect(ed.getByTestId('wv-bump-note'), 'a body edit warns it bumps the version').toBeVisible()
  await ed.getByTestId('wizard-submit').click()
  await expect(ed).toBeHidden({ timeout: 20_000 })
}

test('F3 · member signs → Signed vN (artifact persists) → body edit bumps → Outdated → re-sign', async ({ browser }) => {
  test.setTimeout(200_000)
  const owner = await ctxFor(browser, 'owner')
  const member = await ctxFor(browser, 'student') // Karim Mourad (own student record)
  try {
    // ── 1. The seeded template exists at v1 (staff view) ──
    await owner.page.goto('/en/settings?tab=comms') // J5b: waiver card re-homed to the comms tab
    await expect(vis(owner.page, '[data-testid="waiver-template-version"]').first()).toContainText('v1', { timeout: 15_000 })

    // ── 2. The member reads + signs their own waiver from the portal ──
    await member.page.goto('/en/portal')
    const card = vis(member.page, '[data-testid="portal-waiver"]').first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card, 'unsigned before signing').toHaveAttribute('data-state', 'unsigned')
    await signFlow(member.page, 'portal-waiver', 'Karim Mourad')
    await expect(vis(member.page, '[data-testid="portal-waiver"]').first(), 'portal shows Signed')
      .toHaveAttribute('data-state', 'signed', { timeout: 15_000 })
    await expect(vis(member.page, '[data-testid="portal-waiver-chip"]').first()).toHaveAttribute('data-version', '1')

    // ── Member-360 (staff): Signed v1 + the artifact persisted + signer = self ──
    await owner.page.goto('/en/students?search=Karim')
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click()
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="waiver-chip"]').first()).toHaveAttribute('data-state', 'signed')
    await expect(vis(owner.page, '[data-testid="waiver-chip"]').first()).toHaveAttribute('data-version', '1')
    await expect(vis(owner.page, '[data-testid="member-waiver-artifact"]').first(), 'the PNG artifact persisted in-row')
      .toHaveAttribute('src', /^data:image\/png/)
    await expect(vis(owner.page, '[data-testid="member-waiver-signer"]').first()).toContainText('Karim')

    // ── 3. Staff body edit bumps the version → v2 ──
    await bumpWaiverBody(owner.page, `Updated liability waiver text ${Date.now()}.`)
    await expect(vis(owner.page, '[data-testid="waiver-template-version"]').first()).toContainText('v2', { timeout: 15_000 })

    // ── 4. The member is now Outdated → re-signs → a NEW row → Signed v2 ──
    await member.page.goto('/en/portal')
    const card2 = vis(member.page, '[data-testid="portal-waiver"]').first()
    await expect(card2, 'a version bump flips the member to Outdated').toHaveAttribute('data-state', 'outdated', { timeout: 15_000 })
    await signFlow(member.page, 'portal-waiver', 'Karim Mourad')
    await expect(vis(member.page, '[data-testid="portal-waiver"]').first()).toHaveAttribute('data-state', 'signed', { timeout: 15_000 })

    await owner.page.goto('/en/students?search=Karim')
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click()
    await expect(vis(owner.page, '[data-testid="waiver-chip"]').first(), 'Member-360 reflects the re-sign at v2')
      .toHaveAttribute('data-version', '2', { timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="waiver-chip"]').first()).toHaveAttribute('data-state', 'signed')
  } finally {
    await owner.ctx.close()
    await member.ctx.close()
  }
})

test('F3 · guardian signs a minor’s waiver → signed_by = guardian, student = kid', async ({ browser }) => {
  test.setTimeout(160_000)
  const owner = await ctxFor(browser, 'owner')
  const guardian = await ctxFor(browser, 'parent') // Rana → kids Omar + Lina
  try {
    // Guardian portal → select Omar → the kid waiver card (unsigned) → sign.
    await guardian.page.goto('/en/portal')
    await expect(guardian.page).toHaveURL(/\/portal\?kid=/, { timeout: 15_000 })
    await vis(guardian.page, '[data-testid="kid-chip"]').filter({ hasText: 'Omar' }).first().click()
    await expect(vis(guardian.page, '[data-testid="kid-name"]').first()).toContainText('Omar', { timeout: 15_000 })
    const kidCard = vis(guardian.page, '[data-testid="kid-waiver"]').first()
    await expect(kidCard).toBeVisible({ timeout: 15_000 })
    await signFlow(guardian.page, 'kid-waiver', 'Rana Saad')
    await expect(vis(guardian.page, '[data-testid="kid-waiver"]').first()).toHaveAttribute('data-state', 'signed', { timeout: 15_000 })

    // Member-360 (staff, Omar): the signer on the record is the GUARDIAN (Rana).
    await owner.page.goto('/en/students?search=Omar')
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Omar' }).first().click()
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="waiver-chip"]').first()).toHaveAttribute('data-state', 'signed')
    await expect(vis(owner.page, '[data-testid="member-waiver-signer"]').first(), 'the minor’s waiver was signed by the guardian')
      .toContainText('Rana')
    await expect(vis(owner.page, '[data-testid="member-waiver-artifact"]').first()).toHaveAttribute('src', /^data:image\/png/)
  } finally {
    await owner.ctx.close()
    await guardian.ctx.close()
  }
})
