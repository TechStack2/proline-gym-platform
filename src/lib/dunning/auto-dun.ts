import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchWhatsApp } from '@/lib/whatsapp/dispatch'
import { dunningReminderBody, type MessagingGym } from '@/lib/whatsapp/identity'

/**
 * DUNNING-AUTO — automatic WhatsApp renewal reminders.
 *
 * Reads the due reminders for a gym via due_dunning_reminders() (which enforces
 * the per-gym opt-in server-side — an opted-OUT gym returns zero rows), then sends
 * each via the existing WhatsApp integration (record/live), deduped by the row's
 * dedup_key so the same reminder is never sent twice. Idempotent: a second run
 * finds nothing new (the reader excludes already-sent keys). NEVER throws — a
 * messaging failure must not break a scheduler tick (dispatchWhatsApp is
 * best-effort; we only aggregate its result).
 *
 * Invocable directly (the e2e + a manual "run now") and by a future scheduler —
 * see the DUNNING-AUTO scheduler recommendation before wiring one.
 */
type DueReminder = {
  invoice_id: string
  to_phone: string
  member_name: string | null
  member_locale: string
  nudge: 'upcoming' | 'overdue'
  dedup_key: string
  amount_usd: number
  due_date: string
  product_type: string
}

export type AutoDunResult = { considered: number; sent: number; deduped: number; failed: number }

export async function runAutoDunning(gymId: string): Promise<AutoDunResult> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('due_dunning_reminders', { p_gym_id: gymId })
  const due = (error ? [] : (data ?? [])) as DueReminder[]

  // WL-IDENTITY: sign each reminder with THIS gym's localized name (not "PRO LINE").
  // One fetch per run; the default gym → its own name; a missing name → the default.
  const { data: gymRow } = await admin
    .from('gyms').select('name_ar, name_en, name_fr').eq('id', gymId).maybeSingle()
  const gym = (gymRow ?? null) as MessagingGym | null

  const result: AutoDunResult = { considered: due.length, sent: 0, deduped: 0, failed: 0 }
  for (const r of due) {
    const template = r.nudge === 'overdue' ? 'dunning_overdue' : 'dunning_upcoming'
    const res = await dispatchWhatsApp(gymId, r.to_phone, template, dunningReminderBody(r, gym), r.dedup_key)
    if (res.deduped) result.deduped++
    else if (res.dispatched) result.sent++
    else result.failed++
  }
  return result
}
