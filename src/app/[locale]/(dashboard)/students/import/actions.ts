'use server'

/**
 * IMPORT-MEMBERS — bulk create profile-only members (+ optional guardian link) from
 * a parsed spreadsheet. Mirrors the manual add-student flow exactly: the member is
 * created via the create_student RPC (profiles + students row, NO membership, NO
 * invoice, NO registration); guardians reuse the wizard's find_profile_by_phone →
 * insert profiles → insert guardians → insert guardian_students sequence. Owner +
 * reception only. Idempotent: re-uploading skips anyone already a member (matched by
 * normalized phone), so a partial-failure re-run is safe.
 */
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit/log'
import { normalizePhone } from '@/lib/utils/phone'
import { buildImportPlan, type RawRow } from '@/lib/members/import'
import type { Database } from '@/types/database'

// R1: owner + reception (NOT head_coach/coach) may import.
const IMPORT_ROLES = new Set(['owner', 'receptionist'])

type Ctx = { supabase: SupabaseClient; userId: string; gymId: string }
async function importerContext(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return { error: 'no_gym' }
  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('gym_id', gymId)
  if (!((roles ?? []) as { role: string }[]).some((r) => IMPORT_ROLES.has(r.role))) return { error: 'not_allowed' }
  return { supabase, userId: user.id, gymId }
}

// The set of phones (normalized) of people who are ALREADY members of the gym — the
// preview dedupe key + the idempotency guard.
async function existingMemberPhones(supabase: SupabaseClient, gymId: string): Promise<Set<string>> {
  const { data } = await supabase.from('students').select('profiles!inner(phone)').eq('gym_id', gymId)
  const set = new Set<string>()
  for (const s of (data ?? []) as { profiles: { phone: string | null } | { phone: string | null }[] }[]) {
    const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
    const n = normalizePhone(p?.phone)
    if (n) set.add(n)
  }
  return set
}

export async function getImportContext(): Promise<{ ok: true; existingPhones: string[] } | { ok: false; error: string }> {
  const ctx = await importerContext()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  return { ok: true, existingPhones: [...(await existingMemberPhones(ctx.supabase, ctx.gymId))] }
}

export type ImportSummary = {
  created: number
  guardiansLinked: number
  guardiansCreated: number
  skipped: number
  failed: number
  errors: { index: number; reason: string }[]
}

export async function importMembers(
  rows: RawRow[],
): Promise<{ ok: true; summary: ImportSummary; batchId: string } | { ok: false; error: string }> {
  const ctx = await importerContext()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { supabase, userId, gymId } = ctx
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'nothing_to_import' }
  if (rows.length > 1000) return { ok: false, error: 'too_many_rows' }

  // Re-plan SERVER-SIDE against a fresh existing-members read — never trust the
  // client's dispositions, and stay idempotent across re-uploads / partial re-runs.
  const existing = await existingMemberPhones(supabase, gymId)
  const plan = buildImportPlan(rows, existing)

  const summary: ImportSummary = { created: 0, guardiansLinked: 0, guardiansCreated: 0, skipped: 0, failed: 0, errors: [] }

  for (const r of plan) {
    if (r.disposition === 'duplicate_skip' || r.disposition === 'example') { summary.skipped += 1; continue }
    if (r.disposition === 'error') { summary.failed += 1; summary.errors.push({ index: r.index, reason: r.reasons[0] ?? 'error' }); continue }

    try {
      // create_student's generated Args type marks every param non-null, but the
      // plpgsql function accepts NULL for the identity/date/enum params (the
      // profiles/students columns are nullable). Cast bridges that gen-types
      // arg-nullability gap — this is NOT a stale-type cast (gen never marks
      // function args nullable). Runtime NULL is the intended profile-only shape.
      const args = {
        p_first_name_ar: r.raw.first_name_ar || null,
        p_first_name_en: r.raw.first_name_en || null,
        p_first_name_fr: null,
        p_last_name_ar: r.raw.last_name_ar || null,
        p_last_name_en: r.raw.last_name_en || null,
        p_last_name_fr: null,
        p_phone: r.normalizedPhone || null,
        p_gender: null,
        p_date_of_birth: r.raw.birthdate || null,
        p_emergency_contact_name: r.raw.guardian_name || null,
        p_emergency_contact_phone: r.guardianPhone || null,
        p_medical_notes: r.raw.notes || null,
        p_join_date: r.raw.last_seen || null, // best available past date; NULL → CURRENT_DATE
        p_current_belt_rank: null,
      } as unknown as Database['public']['Functions']['create_student']['Args']

      const { data: student, error: cErr } = await supabase.rpc('create_student', args)
      if (cErr || !student) { summary.failed += 1; summary.errors.push({ index: r.index, reason: 'create_failed' }); continue }
      const studentRow = student as unknown as { id: string; profile_id: string }

      // status → students.is_active (lapsed = inactive roster). Member-list filter
      // only; never billing. create_student sets is_active=true, so only flip lapsed.
      if (r.status === 'lapsed') {
        await supabase.from('students').update({ is_active: false }).eq('id', studentRow.id)
      }
      summary.created += 1
      existing.add(r.normalizedPhone) // in-batch idempotency

      if (r.guardianPhone) {
        try {
          const linked = await linkGuardian(supabase, gymId, studentRow.id, r.guardianPhone, r.raw.guardian_name)
          summary.guardiansLinked += 1
          if (linked === 'created') summary.guardiansCreated += 1
        } catch {
          // Guardian link is best-effort — the member is imported regardless.
        }
      }
    } catch {
      summary.failed += 1
      summary.errors.push({ index: r.index, reason: 'create_failed' })
    }
  }

  // Batch audit trail (best-effort, service-role): one summary row for the import.
  const batchId = randomUUID()
  try {
    await recordAudit(createAdminClient(), {
      tableName: 'member_import',
      recordId: batchId,
      operation: 'create',
      gymId,
      changedBy: userId,
      newData: {
        created: summary.created,
        guardiansLinked: summary.guardiansLinked,
        guardiansCreated: summary.guardiansCreated,
        skipped: summary.skipped,
        failed: summary.failed,
        rowsSubmitted: rows.length,
      },
    })
  } catch {
    // audit is never allowed to block the import
  }

  revalidatePath('/', 'layout')
  return { ok: true, summary, batchId }
}

/**
 * Link (or create) a guardian for a student — the wizard's exact idiom: dedupe the
 * guardian profile by normalized phone (find_profile_by_phone), insert the profile
 * if new, ensure a guardians row, then link via guardian_students (idempotent on the
 * UNIQUE(guardian_id, student_id)). Returns whether the guardian profile was newly created.
 */
async function linkGuardian(
  supabase: SupabaseClient,
  gymId: string,
  studentId: string,
  guardianPhone: string,
  guardianName: string,
): Promise<'linked' | 'created'> {
  let created = false
  const { data: found } = await supabase.rpc('find_profile_by_phone', { p_phone: guardianPhone })
  const foundRow = (Array.isArray(found) ? found[0] : found) as { id: string } | null | undefined

  let profileId: string
  if (foundRow?.id) {
    profileId = foundRow.id
  } else {
    const name = guardianName || null
    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .insert({ gym_id: gymId, phone: guardianPhone, first_name_en: name, first_name_ar: name, first_name_fr: name })
      .select('id')
      .single()
    if (pErr || !prof) throw pErr ?? new Error('guardian_profile_insert')
    profileId = prof.id
    created = true
  }

  const { data: g } = await supabase.from('guardians').select('id').eq('profile_id', profileId).eq('gym_id', gymId).maybeSingle()
  let guardianId = g?.id
  if (!guardianId) {
    const { data: gi, error: gErr } = await supabase
      .from('guardians')
      .insert({ profile_id: profileId, gym_id: gymId, is_primary_contact: true })
      .select('id')
      .single()
    if (gErr || !gi) throw gErr ?? new Error('guardian_insert')
    guardianId = gi.id
  }

  const { error: lErr } = await supabase.from('guardian_students').insert({ guardian_id: guardianId, student_id: studentId })
  if (lErr && lErr.code !== '23505') throw lErr // 23505 = already linked (idempotent)
  return created ? 'created' : 'linked'
}
