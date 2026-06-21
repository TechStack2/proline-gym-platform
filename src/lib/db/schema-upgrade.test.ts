import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'
import { getOfflineDB } from './schema'

// Temporary verification (OFF-3b): does the v4 upgrade (pending_leads) preserve the
// v2/v3 stores the offline desk + G2 attendance read? Two scenarios: a FRESH open at
// v4 (what every CI test context does), and an actual v3→v4 migration.

describe('OFF-3b · Dexie v4 upgrade preserves existing stores', () => {
  it('FRESH open at v4 (CI scenario): attendance + payments + leads all writable', async () => {
    const db = getOfflineDB()
    await db.open()
    expect(db.verno).toBe(4)
    const names = db.tables.map((t) => t.name)
    for (const s of ['pending_attendance', 'pending_payments', 'pending_leads', 'roster_cache', 'students', 'invoices']) {
      expect(names, `store ${s} present`).toContain(s)
    }
    // G2 attendance queue still writable at v4
    await db.pending_attendance.put({ class_id: 'c1', student_id: 's1', attendance_date: '2026-06-22', status: 'late', client_ts: new Date().toISOString() })
    const mark = await db.pending_attendance.get(['c1', 's1', '2026-06-22'])
    expect(mark?.status).toBe('late')
    // OFF-3 payments + OFF-3b leads queues writable
    await db.pending_payments.put({ op_id: 'p1', invoice_id: 'i1', student_id: 's1', amount_usd: 10, amount_lbp: 0, method: 'cash_usd', reference: null, exchange_rate: null, payment_date: '2026-06-22', client_ts: new Date().toISOString(), status: 'pending' })
    await db.pending_leads.put({ op_id: 'l1', first_name: 'A', last_name: 'B', phone: '1', email: null, source: 'walk_in', source_detail: null, discipline_id: null, notes: null, client_ts: new Date().toISOString(), status: 'pending' })
    expect(await db.pending_payments.count()).toBe(1)
    expect(await db.pending_leads.count()).toBe(1)
    db.close()
  })

  it('v3 → v4 MIGRATION: a queued attendance mark survives + leads store is added', async () => {
    const NAME = 'dexie_v3_to_v4_migration_test'
    await Dexie.delete(NAME)

    // Replicate the additive chain through v3, write a mark, close.
    class V3 extends Dexie {
      constructor() {
        super(NAME)
        this.version(1).stores({ students: 'id, gym_id', sync_metadata: 'table_name' })
        this.version(2).stores({ pending_attendance: '[class_id+student_id+attendance_date], client_ts', roster_cache: 'key, cached_at' })
        this.version(3).stores({ pending_payments: 'op_id, client_ts, status' })
      }
    }
    const v3 = new V3()
    await v3.open()
    expect(v3.verno).toBe(3)
    await (v3 as any).pending_attendance.put({ class_id: 'cX', student_id: 'sX', attendance_date: '2026-06-22', status: 'present', client_ts: new Date().toISOString() })
    await (v3 as any).pending_payments.put({ op_id: 'pX', client_ts: new Date().toISOString(), status: 'pending' })
    v3.close()

    // Re-open the SAME db with v4 added → triggers the v3→v4 upgrade.
    class V4 extends Dexie {
      constructor() {
        super(NAME)
        this.version(1).stores({ students: 'id, gym_id', sync_metadata: 'table_name' })
        this.version(2).stores({ pending_attendance: '[class_id+student_id+attendance_date], client_ts', roster_cache: 'key, cached_at' })
        this.version(3).stores({ pending_payments: 'op_id, client_ts, status' })
        this.version(4).stores({ pending_leads: 'op_id, client_ts, status' })
      }
    }
    const v4 = new V4()
    await v4.open()
    expect(v4.verno).toBe(4)
    // The pre-existing attendance + payment rows SURVIVED the upgrade.
    const mark = await (v4 as any).pending_attendance.get(['cX', 'sX', '2026-06-22'])
    expect(mark?.status, 'attendance mark survived v3→v4').toBe('present')
    expect(await (v4 as any).pending_payments.count(), 'payment queue survived').toBe(1)
    // The new leads store exists + is writable.
    await (v4 as any).pending_leads.put({ op_id: 'lX', client_ts: new Date().toISOString(), status: 'pending' })
    expect(await (v4 as any).pending_leads.count()).toBe(1)
    v4.close()
    await Dexie.delete(NAME)
  })
})
