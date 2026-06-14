/**
 * G2 — offline attendance: roster cache + pending-marks queue + flush.
 *
 * The ONLY offline-write flow in V1. Built on the EXISTING Dexie DB
 * (proline_offline_db, schema.ts) — no new server schema. The flush drains the
 * queue through the EXISTING idempotent attendance write path (saveAttendance,
 * onConflict class_id+student_id+attendance_date) passed in as `save`, so a
 * double-flush or a server-side change can't create duplicates (last-write-wins).
 *
 * Client-only (IndexedDB). Best-effort per (class,date) group: a group whose
 * save fails stays queued; it never blocks the other groups, never loses a mark.
 */
import { getOfflineDB } from '@/lib/db/schema'
import type { PendingAttendanceMark } from '@/lib/db/schema'

export type MarkStatus = PendingAttendanceMark['status']

export type SaveAttendance = (input: {
  classId: string
  date: string
  records: { studentId: string; status: MarkStatus }[]
}) => Promise<{ ok: true; notified?: number } | { ok: false; error: string }>

const db = () => getOfflineDB()

// ── Roster cache (written on an ONLINE page load; read when offline) ──────────
export async function cacheRoster(key: string, value: unknown): Promise<void> {
  await db().roster_cache.put({ key, value, cached_at: new Date().toISOString() })
}
export async function readRoster<T>(key: string): Promise<T | null> {
  const row = await db().roster_cache.get(key)
  return (row?.value as T) ?? null
}

// ── Pending-marks queue ───────────────────────────────────────────────────────
/** Queue (or replace) an offline mark. Compound PK → re-marking the same student
 *  overwrites the queued status (local LWW); client_ts is refreshed each time. */
export async function queueMark(m: {
  class_id: string; student_id: string; attendance_date: string; status: MarkStatus
}): Promise<void> {
  await db().pending_attendance.put({ ...m, client_ts: new Date().toISOString() })
}

export async function pendingCount(): Promise<number> {
  return db().pending_attendance.count()
}

export async function listPending(): Promise<PendingAttendanceMark[]> {
  return db().pending_attendance.orderBy('client_ts').toArray()
}

// ── Flush: drain oldest-first through the existing upsert path ─────────────────
export async function flushPending(
  save: SaveAttendance,
): Promise<{ flushed: number; remaining: number; failedGroups: number }> {
  const items = await listPending()
  if (items.length === 0) return { flushed: 0, remaining: 0, failedGroups: 0 }

  // Group by (class_id, attendance_date) — the unit saveAttendance accepts.
  // Insertion order follows client_ts asc, so earliest groups drain first.
  const groups = new Map<string, PendingAttendanceMark[]>()
  for (const it of items) {
    const k = `${it.class_id}|${it.attendance_date}`
    const g = groups.get(k)
    if (g) g.push(it)
    else groups.set(k, [it])
  }

  let flushed = 0
  let failedGroups = 0
  for (const grp of groups.values()) {
    try {
      const res = await save({
        classId: grp[0].class_id,
        date: grp[0].attendance_date,
        records: grp.map((g) => ({ studentId: g.student_id, status: g.status })),
      })
      if (res.ok) {
        // Idempotent: removing only on success means a failed group is retried next flush.
        await db().pending_attendance.bulkDelete(
          grp.map((g) => [g.class_id, g.student_id, g.attendance_date] as [string, string, string]),
        )
        flushed += grp.length
      } else {
        failedGroups += 1 // leave queued — best-effort, never blocks the others
      }
    } catch {
      failedGroups += 1
    }
  }
  return { flushed, remaining: await pendingCount(), failedGroups }
}
