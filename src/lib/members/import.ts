// ── Bulk member import — pure parsing / validation / disposition logic ──
// Framework-free + Supabase-free so it unit-tests cleanly and runs identically on
// the client (preview) and could run on the server. The upload is parsed as .xlsx
// (unicode-native → Arabic survives the Excel round-trip; naive CSV does not), then
// mapped to rows BY COLUMN POSITION (the header row is localized, so never trust its
// text) and run through buildImportPlan to get a per-row disposition.

import { normalizePhone } from '@/lib/utils/phone'

// Column order IS the contract — the template writes these in this order and the
// parser reads by index. Keep in sync with IMPORT_TEMPLATE below.
export const IMPORT_COLUMNS = [
  'first_name_en',
  'last_name_en',
  'first_name_ar',
  'last_name_ar',
  'phone',
  'birthdate',
  'guardian_name',
  'guardian_phone',
  'status',
  'last_seen',
  'notes',
] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

export type RawRow = Record<ImportColumn, string>
export type MemberStatus = 'active' | 'lapsed'
export type Disposition = 'create' | 'create_link_guardian' | 'duplicate_skip' | 'error' | 'example'

export type PlannedRow = {
  index: number // 1-based data row number (excludes the header)
  raw: RawRow
  normalizedPhone: string
  guardianPhone: string | null
  status: MemberStatus
  disposition: Disposition
  // machine codes (also i18n keys under students.import.reason.*) explaining the disposition
  reasons: string[]
  willLinkGuardian: boolean
}

// A sentinel example row shipped in the template (row 2). Its phone is an obvious
// non-number so a pristine, un-edited template imports NOTHING (every real row is
// the staff's; the example is auto-skipped). Documented on the import screen.
export const EXAMPLE_PHONE = '+961 71 000 000'
const EXAMPLE_PHONE_NORM = normalizePhone(EXAMPLE_PHONE)

// The single example row shipped as row 2 of the template (positional). Arabic +
// English names both present so staff see the round-trip works. Auto-skipped on import.
export const EXAMPLE_ROW: RawRow = {
  first_name_en: 'Ahmad',
  last_name_en: 'Khalil',
  first_name_ar: 'أحمد',
  last_name_ar: 'خليل',
  phone: EXAMPLE_PHONE,
  birthdate: '1998-04-15',
  guardian_name: '',
  guardian_phone: '',
  status: 'lapsed',
  last_seen: '2024-11-30',
  notes: 'Example row — delete or replace before importing',
}

/** Map a positional cell array (one sheet row) → a trimmed RawRow. Missing/extra
 *  cells are tolerated; every value is coerced to a trimmed string. */
export function rowFromCells(cells: unknown[]): RawRow {
  const out = {} as RawRow
  IMPORT_COLUMNS.forEach((col, i) => {
    const v = cells[i]
    out[col] = v == null ? '' : String(v).trim()
  })
  return out
}

// active/lapsed with locale-tolerant parsing; anything else (incl. blank) → lapsed
// (the default: these are ex-members being loaded for win-back).
export function parseStatus(v: string): MemberStatus {
  const s = (v || '').trim().toLowerCase()
  if (s.startsWith('active') || s.startsWith('actif') || s.startsWith('نشط')) return 'active'
  return 'lapsed'
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isBlankRow(r: RawRow): boolean {
  return IMPORT_COLUMNS.every((c) => !r[c])
}
function hasName(r: RawRow): boolean {
  return !!(r.first_name_en || r.first_name_ar || r.last_name_en || r.last_name_ar)
}

/**
 * Turn raw rows into a validated plan. `existingMemberPhones` is the set of
 * ALREADY-imported/known member phones for the gym (normalized) — used for the
 * "duplicate-skip (existing member)" disposition + idempotent re-uploads.
 *
 * Disposition precedence: example > error > duplicate_skip > create_link_guardian > create.
 */
export function buildImportPlan(rawRows: RawRow[], existingMemberPhones: Set<string> = new Set()): PlannedRow[] {
  const seenInFile = new Set<string>()
  const plan: PlannedRow[] = []
  let dataIndex = 0

  for (const raw of rawRows) {
    if (isBlankRow(raw)) continue // ignore trailing/empty sheet rows entirely
    dataIndex += 1

    const normalizedPhone = normalizePhone(raw.phone)
    const guardianPhone = raw.guardian_phone ? normalizePhone(raw.guardian_phone) : null
    const status = parseStatus(raw.status)
    const reasons: string[] = []

    // The shipped example row is auto-excluded so an un-edited template imports nothing.
    if (normalizedPhone && normalizedPhone === EXAMPLE_PHONE_NORM) {
      plan.push({ index: dataIndex, raw, normalizedPhone, guardianPhone, status, disposition: 'example', reasons: ['example_row'], willLinkGuardian: false })
      continue
    }

    // Hard validation → error (blocks import until fixed/excluded).
    if (!raw.phone) reasons.push('missing_phone')
    else if (!normalizedPhone) reasons.push('invalid_phone')
    if (!hasName(raw)) reasons.push('missing_name')
    if (raw.birthdate && !DATE_RE.test(raw.birthdate)) reasons.push('invalid_birthdate')
    if (raw.last_seen && !DATE_RE.test(raw.last_seen)) reasons.push('invalid_last_seen')
    if (raw.guardian_phone && !guardianPhone) reasons.push('invalid_guardian_phone')

    if (reasons.length) {
      plan.push({ index: dataIndex, raw, normalizedPhone, guardianPhone, status, disposition: 'error', reasons, willLinkGuardian: false })
      continue
    }

    // Dedupe: within the file (first wins) then against existing members.
    if (seenInFile.has(normalizedPhone)) {
      plan.push({ index: dataIndex, raw, normalizedPhone, guardianPhone, status, disposition: 'duplicate_skip', reasons: ['duplicate_in_file'], willLinkGuardian: false })
      continue
    }
    if (existingMemberPhones.has(normalizedPhone)) {
      seenInFile.add(normalizedPhone)
      plan.push({ index: dataIndex, raw, normalizedPhone, guardianPhone, status, disposition: 'duplicate_skip', reasons: ['existing_member'], willLinkGuardian: false })
      continue
    }

    seenInFile.add(normalizedPhone)
    const willLinkGuardian = !!guardianPhone
    plan.push({
      index: dataIndex,
      raw,
      normalizedPhone,
      guardianPhone,
      status,
      disposition: willLinkGuardian ? 'create_link_guardian' : 'create',
      reasons: willLinkGuardian ? ['will_link_guardian'] : [],
      willLinkGuardian,
    })
  }

  return plan
}

/** Rows that will actually be written (create / create_link_guardian, not excluded). */
export function importableRows(plan: PlannedRow[], excluded: Set<number> = new Set()): PlannedRow[] {
  return plan.filter((r) => (r.disposition === 'create' || r.disposition === 'create_link_guardian') && !excluded.has(r.index))
}

/** True when the plan has any unresolved error row (not excluded) — blocks import. */
export function hasBlockingErrors(plan: PlannedRow[], excluded: Set<number> = new Set()): boolean {
  return plan.some((r) => r.disposition === 'error' && !excluded.has(r.index))
}

export type PlanSummary = { total: number; create: number; linkGuardian: number; skip: number; error: number; example: number }
export function summarizePlan(plan: PlannedRow[]): PlanSummary {
  const s: PlanSummary = { total: 0, create: 0, linkGuardian: 0, skip: 0, error: 0, example: 0 }
  for (const r of plan) {
    s.total += 1
    if (r.disposition === 'create') s.create += 1
    else if (r.disposition === 'create_link_guardian') { s.create += 1; s.linkGuardian += 1 }
    else if (r.disposition === 'duplicate_skip') s.skip += 1
    else if (r.disposition === 'error') s.error += 1
    else if (r.disposition === 'example') s.example += 1
  }
  return s
}
