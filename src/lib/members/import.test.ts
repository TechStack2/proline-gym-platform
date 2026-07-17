import { describe, it, expect } from 'vitest'
import {
  rowFromCells, parseStatus, buildImportPlan, importableRows, hasBlockingErrors,
  summarizePlan, EXAMPLE_ROW, IMPORT_COLUMNS, type RawRow,
} from './import'

// Build a RawRow from a partial (blanks for the rest) — keeps the tests terse.
function row(p: Partial<RawRow>): RawRow {
  const base = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ''])) as RawRow
  return { ...base, ...p }
}

describe('member import — parsing + Arabic fidelity', () => {
  it('maps positional cells to columns and preserves Arabic text verbatim', () => {
    const r = rowFromCells(['Ahmad', 'Khalil', 'أحمد', 'خليل', '03 111 222', '', '', '', 'active', '', 'ملاحظة'])
    expect(r.first_name_en).toBe('Ahmad')
    expect(r.first_name_ar).toBe('أحمد') // Arabic survives the round-trip byte-for-byte
    expect(r.last_name_ar).toBe('خليل')
    expect(r.notes).toBe('ملاحظة')
    expect(r.status).toBe('active')
  })

  it('trims cells and tolerates missing/extra cells', () => {
    const r = rowFromCells(['  Sara  ', , 'سارة'])
    expect(r.first_name_en).toBe('Sara')
    expect(r.first_name_ar).toBe('سارة')
    expect(r.phone).toBe('')
  })

  it('parseStatus defaults to lapsed and reads active in en/fr/ar', () => {
    expect(parseStatus('')).toBe('lapsed')
    expect(parseStatus('anything')).toBe('lapsed')
    expect(parseStatus('Active')).toBe('active')
    expect(parseStatus('actif')).toBe('active')
    expect(parseStatus('نشط')).toBe('active')
  })
})

describe('member import — phone normalize + disposition', () => {
  it('normalizes the phone (dedupe key) to +digits', () => {
    const plan = buildImportPlan([row({ first_name_en: 'A', phone: '03 111 222' })])
    expect(plan[0].normalizedPhone).toBe('+9613111222')
    expect(plan[0].disposition).toBe('create')
  })

  it('flags missing phone / missing name / bad dates as errors', () => {
    const plan = buildImportPlan([
      row({ first_name_en: 'NoPhone' }),
      row({ phone: '03 111 000' }), // no name
      row({ first_name_en: 'BadDob', phone: '03 111 001', birthdate: '15/04/1998' }),
    ])
    expect(plan[0].disposition).toBe('error')
    expect(plan[0].reasons).toContain('missing_phone')
    expect(plan[1].reasons).toContain('missing_name')
    expect(plan[2].reasons).toContain('invalid_birthdate')
    expect(hasBlockingErrors(plan)).toBe(true)
  })

  it('marks a guardian_phone row as create_link_guardian', () => {
    const plan = buildImportPlan([row({ first_name_ar: 'ولد', phone: '03 222 000', guardian_name: 'Dad', guardian_phone: '03 999 000' })])
    expect(plan[0].disposition).toBe('create_link_guardian')
    expect(plan[0].willLinkGuardian).toBe(true)
    expect(plan[0].guardianPhone).toBe('+9613999000')
  })
})

describe('member import — dedupe matrix', () => {
  it('within-file duplicate (same normalized phone) → first creates, rest skip', () => {
    const plan = buildImportPlan([
      row({ first_name_en: 'First', phone: '03 111 222' }),
      row({ first_name_en: 'Dup', phone: '+961 3 111 222' }), // same number, different format
    ])
    expect(plan[0].disposition).toBe('create')
    expect(plan[1].disposition).toBe('duplicate_skip')
    expect(plan[1].reasons).toContain('duplicate_in_file')
  })

  it('existing member (already in the gym) → duplicate_skip (idempotent re-upload)', () => {
    const existing = new Set(['+9613111222'])
    const plan = buildImportPlan([row({ first_name_en: 'Known', phone: '03 111 222' })], existing)
    expect(plan[0].disposition).toBe('duplicate_skip')
    expect(plan[0].reasons).toContain('existing_member')
    expect(importableRows(plan)).toHaveLength(0) // nothing to write
  })

  it('the shipped example row is auto-excluded (pristine template imports nothing)', () => {
    const plan = buildImportPlan([EXAMPLE_ROW])
    expect(plan[0].disposition).toBe('example')
    expect(importableRows(plan)).toHaveLength(0)
    expect(hasBlockingErrors(plan)).toBe(false)
  })

  it('blank trailing rows are ignored entirely', () => {
    const plan = buildImportPlan([row({ first_name_en: 'A', phone: '03 111 222' }), row({})])
    expect(plan).toHaveLength(1)
  })
})

describe('member import — summary + exclusions', () => {
  it('summarizes dispositions and respects excluded rows', () => {
    const plan = buildImportPlan([
      row({ first_name_en: 'Create', phone: '03 100 000' }),
      row({ first_name_en: 'Kid', phone: '03 200 000', guardian_phone: '03 900 000' }),
      row({ first_name_en: 'Dup', phone: '03 100 000' }),
      row({ phone: '03 300 000' }), // error: no name
    ])
    const s = summarizePlan(plan)
    expect(s).toMatchObject({ create: 2, linkGuardian: 1, skip: 1, error: 1 })
    // excluding the error row clears the block; excluding a create drops it from the write set
    expect(hasBlockingErrors(plan, new Set([4]))).toBe(false)
    expect(importableRows(plan, new Set([1]))).toHaveLength(1)
  })
})
