'use server'

/**
 * Coach 360 — the ONE guardrailed write on this surface (TEAM-1).
 *
 * Locked permission fork: owner + head_coach + reception all MANAGE coach
 * scheduling/availability/assignments (those reuse existing verified writers
 * — coach_availability inserts, book_pt_session, the class wizard — gated by
 * the staff `coach_availability_staff` / `coaches_staff` RLS that already
 * covers reception in-gym). DEACTIVATE is the single owner/head_coach-only
 * action, so it is gated here on the CALLER'S role (defense-in-depth on top of
 * RLS, which can't separate reception from owner without a per-column split we
 * deliberately don't make — see the audit note). The write itself is the same
 * archive-not-delete pattern the ADM-1 coach detail used.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const PRIVILEGED = ['owner', 'head_coach']

export async function setCoachActive(input: {
  coachId: string
  active: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role, gym_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!roleRow || !PRIVILEGED.includes(roleRow.role)) return { ok: false, error: 'forbidden' }

  const { error } = await supabase
    .from('coaches')
    .update(
      input.active
        ? { is_active: true, deleted_at: null }
        : { is_active: false, deleted_at: new Date().toISOString() },
    )
    .eq('id', input.coachId)
    .eq('gym_id', roleRow.gym_id) // tenant scope (RLS also enforces this)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/[locale]/coaches', 'page')
  revalidatePath('/[locale]/coaches/[id]', 'page')
  return { ok: true }
}

/**
 * COACH-LP — admin publish: applies the coach's pending draft → live + makes the
 * coach landing_visible. The owner/head_coach gate lives in the RPC (defense in
 * depth, mirroring setCoachActive); reception may edit a draft but never reach
 * this (the UI hides it + the RPC raises 'forbidden').
 */
export async function publishCoachProfile(input: {
  coachId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  // COACH-PHOTO-GATE: if a draft photo is staged (a PRIVATE coach-avatar-drafts
  // path in pending.avatar_url), promote it — copy the bytes into the PUBLIC
  // `avatars` bucket at the live contract path, then hand the resulting public
  // URL to the RPC so it sets profiles.avatar_url atomically + gated. This byte
  // copy is the ONLY path a coach photo reaches the landing; the owner/head_coach
  // gate is re-checked inside the RPC (defense in depth). Done BEFORE the RPC so
  // a non-owner caller is rejected by the RPC and nothing goes live.
  const { data: coach } = await supabase
    .from('coaches')
    .select('gym_id, profile_id')
    .eq('id', input.coachId)
    .maybeSingle()
  if (!coach) return { ok: false, error: 'coach not found' }

  const { data: pending } = await supabase
    .from('coach_profile_pending')
    .select('avatar_url')
    .eq('coach_id', input.coachId)
    .maybeSingle()
  const draftPath = (pending as any)?.avatar_url as string | null

  let liveAvatarUrl: string | null = null
  if (draftPath) {
    const { data: blob, error: dlErr } = await supabase.storage.from('coach-avatar-drafts').download(draftPath)
    if (dlErr) return { ok: false, error: dlErr.message }
    const livePath = `${(coach as any).gym_id}/${(coach as any).profile_id}.jpg`
    const { error: upErr } = await supabase.storage.from('avatars').upload(livePath, blob, {
      upsert: true, contentType: 'image/jpeg', cacheControl: '3600',
    })
    if (upErr) return { ok: false, error: upErr.message }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(livePath)
    liveAvatarUrl = `${pub.publicUrl}?v=${Date.now()}` // cache-buster on the in-place replace
  }

  const { error } = await supabase.rpc('publish_coach_profile', {
    p_coach_id: input.coachId,
    p_live_avatar_url: liveAvatarUrl,
  })
  if (error) return { ok: false, error: error.message }

  // The RPC cleared pending (incl. the photo ref) — best-effort remove the now-
  // orphaned private draft object.
  if (draftPath) {
    await supabase.storage.from('coach-avatar-drafts').remove([draftPath]).catch(() => {})
  }

  revalidatePath('/[locale]/coaches/[id]', 'page')
  return { ok: true }
}

/** COACH-LP — owner/head_coach sets landing visibility + status (coming-soon / hide). */
export async function setCoachLanding(input: {
  coachId: string
  visible: boolean
  status: 'active' | 'coming_soon'
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const { error } = await supabase.rpc('set_coach_landing', {
    p_coach_id: input.coachId,
    p_visible: input.visible,
    p_status: input.status,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/[locale]/coaches/[id]', 'page')
  return { ok: true }
}

/**
 * COACH-LP — staff edit: write the coach's pending draft from Coach-360 (owner/
 * head_coach/reception via coach_pending_staff RLS). Same draft path the coach
 * uses; an admin still publishes. Reuses the verified upsert (gym-scoped + RLS).
 */
export async function saveCoachDraftStaff(input: {
  coachId: string
  specialization_ar: string; specialization_en: string; specialization_fr: string
  bio_ar: string; bio_en: string; bio_fr: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const { data: coach } = await supabase.from('coaches').select('gym_id').eq('id', input.coachId).maybeSingle()
  if (!coach) return { ok: false, error: 'coach not found' }
  const trim = (v: string) => (v && v.trim() ? v.trim() : null)
  const { error } = await supabase.from('coach_profile_pending').upsert(
    {
      coach_id: input.coachId,
      gym_id: (coach as any).gym_id,
      specialization_ar: trim(input.specialization_ar),
      specialization_en: trim(input.specialization_en),
      specialization_fr: trim(input.specialization_fr),
      bio_ar: trim(input.bio_ar),
      bio_en: trim(input.bio_en),
      bio_fr: trim(input.bio_fr),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: 'coach_id' },
  )
  if (error) return { ok: false, error: error.message }
  revalidatePath('/[locale]/coaches/[id]', 'page')
  return { ok: true }
}
