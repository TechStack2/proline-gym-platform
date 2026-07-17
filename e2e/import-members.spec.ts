import { test, expect, type Browser } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'
import writeXlsxFile from 'write-excel-file/node'

/**
 * IMPORT-MEMBERS — template → upload (Arabic + English names) → preview dispositions
 * → import → members visible + Lapsed win-back chip → re-upload all-skips → ZERO
 * invoices created. Hermetic own gym (bill-localize/completeness pattern): the import
 * writes real members, so we seed our OWN gym, drive it as owner, and tear it down.
 *
 * The fixture is generated with write-excel-file (.xlsx, unicode-native) carrying
 * Arabic names — proving the Excel round-trip preserves Arabic (naive CSV does not).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `import-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''
const FIXTURE = join(tmpdir(), `member-import-${SLUG}.xlsx`)

// Two real members (one with a guardian), one in-file duplicate, one error row.
// The Arabic-fidelity probe — an ARABIC-ONLY member (no EN name) so the roster/preview
// must display the Arabic that came through the .xlsx round-trip (they prefer EN otherwise).
const AR_NAME = 'عمر'
const cell = (v: string) => (v ? { value: v, type: String } : null)
const HEADER = ['First (EN)', 'Last (EN)', 'First (AR)', 'Last (AR)', 'Phone', 'Birthdate', 'Guardian', 'Guardian phone', 'Status', 'Last seen', 'Notes'].map((v) => ({ value: v, fontWeight: 'bold' as const }))
const DATA_ROWS = [
  ['Layla', 'Haddad', 'ليلى', 'حداد', '03 100 100', '1996-05-05', '', '', 'lapsed', '2024-10-01', 'ex member'],
  ['', '', AR_NAME, 'سعد', '03 200 200', '2012-03-03', 'Nabil Saad', '03 900 900', 'active', '', ''], // Arabic-only + guardian
  ['Layla', 'Copy', '', '', '+961 3 100 100', '', '', '', 'lapsed', '', ''], // in-file dup of row 1
  ['NoPhone', 'Person', '', '', '', '', '', '', 'lapsed', '', ''], // error: missing phone
]

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
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

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('IMPORT-MEMBERS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  // Generate the Arabic .xlsx fixture (row-of-cells form; empty cells → null).
  await writeXlsxFile([HEADER, ...DATA_ROWS.map((r) => r.map(cell))], {}).toFile(FIXTURE)
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('IMPORT-MEMBERS · template → upload (Arabic) → preview → import → lapsed win-back → idempotent re-upload → zero invoices', async ({ browser }) => {
  test.setTimeout(180_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    await owner.page.goto('/en/students/import')
    await expect(owner.page.getByTestId('import-page')).toBeVisible({ timeout: 15_000 })
    await expect(owner.page.getByTestId('import-format-docs'), 'format is documented on screen').toBeVisible()

    // R1 — the template downloads as .xlsx.
    const [dl] = await Promise.all([
      owner.page.waitForEvent('download'),
      owner.page.getByTestId('import-download-template').click(),
    ])
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/)

    // R2 — upload the filled fixture → preview with per-row dispositions.
    await owner.page.getByTestId('import-file-input').setInputFiles(FIXTURE)
    await expect(owner.page.getByTestId('import-preview')).toBeVisible({ timeout: 15_000 })
    await expect(owner.page.getByTestId('sum-create'), '2 creatable').toHaveAttribute('data-count', '2')
    await expect(owner.page.getByTestId('sum-link'), '1 guardian link').toHaveAttribute('data-count', '1')
    await expect(owner.page.getByTestId('sum-skip'), '1 in-file duplicate').toHaveAttribute('data-count', '1')
    await expect(owner.page.getByTestId('sum-error'), '1 error (missing phone)').toHaveAttribute('data-count', '1')
    // AR fidelity: the Arabic name survived the .xlsx round-trip into the preview.
    await expect(owner.page.getByTestId('import-preview')).toContainText(AR_NAME)
    // Nothing imports while an error row is unresolved.
    await expect(owner.page.getByTestId('import-blocked')).toBeVisible()
    await expect(owner.page.getByTestId('import-run')).toBeDisabled()
    // SHOT (en): the preview with dispositions + the block.
    await owner.page.screenshot({ path: 'screenshots/import-members-preview-en.png' }).catch(() => {})

    // ZERO-BILLING baseline: the e2e seed pre-creates some invoices/memberships for
    // its seeded students, so assert the IMPORT adds NONE (delta 0), not an absolute 0.
    const gymInvoices = async () => ((await (await svc(`invoices?gym_id=eq.${gymId}&select=id`)).json()) as unknown[]).length
    const gymMemberships = async () =>
      ((await (await svc(`student_memberships?select=id,students!inner(gym_id)&students.gym_id=eq.${gymId}`)).json()) as unknown[]).length
    const invBefore = await gymInvoices()
    const memBefore = await gymMemberships()

    // Exclude the error row (row 4) → import unblocks.
    await owner.page.getByTestId('import-exclude-4').click()
    await expect(owner.page.getByTestId('import-run')).toBeEnabled()

    // R3 — import creates profile-only members (+ the guardian).
    await owner.page.getByTestId('import-run').click()
    await expect(owner.page.getByTestId('import-result'), 'import completes').toBeVisible({ timeout: 20_000 })
    await expect(owner.page.getByTestId('import-result-summary')).toContainText('2')

    // Members visible on the roster + the Lapsed win-back chip is populated.
    await owner.page.goto('/en/students')
    await expect(owner.page.getByText(AR_NAME).first(), 'the imported Arabic-named member is on the roster').toBeVisible({ timeout: 15_000 })
    const lapsed = owner.page.getByTestId('chip-lapsed')
    await expect(lapsed, 'the Lapsed win-back chip surfaces').toBeVisible()
    expect(Number(await lapsed.getAttribute('data-count')), 'both imported members have no active membership → lapsed').toBeGreaterThanOrEqual(2)
    await lapsed.click()
    await expect(owner.page.getByText(AR_NAME).first(), 'imported member is in the win-back list').toBeVisible()
    await owner.page.screenshot({ path: 'screenshots/import-members-lapsed-en.png' }).catch(() => {})

    // R3 — ZERO billing side-effects: the import created NO invoices and NO
    // memberships (delta vs the pre-import baseline).
    expect(await gymInvoices(), 'the import created NO invoices').toBe(invBefore)
    expect(await gymMemberships(), 'the import created NO memberships').toBe(memBefore)

    // R3 — idempotent re-upload: every row is now a skip (0 creatable).
    await owner.page.goto('/en/students/import')
    await owner.page.getByTestId('import-file-input').setInputFiles(FIXTURE)
    await expect(owner.page.getByTestId('import-preview')).toBeVisible({ timeout: 15_000 })
    await expect(owner.page.getByTestId('sum-create'), 're-upload creates nothing').toHaveAttribute('data-count', '0')

    // ── Arabic (RTL) screenshot of the import screen ──
    await owner.page.goto('/ar/students/import')
    await expect(owner.page.getByTestId('import-page')).toBeVisible({ timeout: 15_000 })
    await owner.page.screenshot({ path: 'screenshots/import-members-page-ar.png' }).catch(() => {})
  } finally {
    await owner.ctx.close()
  }
})
