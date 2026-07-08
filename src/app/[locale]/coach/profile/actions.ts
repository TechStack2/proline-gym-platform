'use server'

/**
 * COACH-LP — write the coach's profile DRAFT (pending, not live).
 *
 * Upserts `coach_profile_pending`; the live `coaches` row is untouched until an
 * admin publishes from Coach-360. RLS does the gating: the coach may write OWN
 * draft (coach_pending_self), staff may write any in-gym draft (coach_pending_
 * staff). The AFTER trigger flips coaches.has_pending_changes. Never publishes —
 * publishing is owner/head_coach-only and lives in Coach-360.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/errors/action-error';

export async function saveCoachDraft(input: {
  coachId: string
  specialization_ar: string
  specialization_en: string
  specialization_fr: string
  bio_ar: string
  bio_en: string
  bio_fr: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  // gym_id for the draft row (RLS also enforces own-coach / in-gym-staff).
  const { data: coach } = await supabase
    .from('coaches')
    .select('gym_id')
    .eq('id', input.coachId)
    .maybeSingle()
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
  if (error) return { ok: false, error: actionError(error) }

  revalidatePath('/[locale]/coach/profile', 'page')
  revalidatePath('/[locale]/coaches/[id]', 'page')
  return { ok: true }
}

/**
 * COACH-PHOTO-GATE — record a DRAFT photo (pending, not live). The browser
 * already uploaded the downscaled image to the PRIVATE `coach-avatar-drafts`
 * bucket (Storage RLS: coach-own / in-gym staff, no anon); here we only record
 * its object PATH in the reserved coach_profile_pending.avatar_url column so the
 * Coach-360 panel can show the diff and publish can promote it. The live
 * profiles.avatar_url is untouched until an admin publishes. Only the photo
 * columns are written → any text draft on the same row is preserved.
 */
export async function saveCoachDraftPhoto(input: {
  coachId: string
  path: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { data: coach } = await supabase
    .from('coaches')
    .select('gym_id')
    .eq('id', input.coachId)
    .maybeSingle()
  if (!coach) return { ok: false, error: 'coach not found' }

  const { error } = await supabase.from('coach_profile_pending').upsert(
    {
      coach_id: input.coachId,
      gym_id: (coach as any).gym_id,
      avatar_url: input.path,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: 'coach_id' },
  )
  if (error) return { ok: false, error: actionError(error) }

  revalidatePath('/[locale]/coach/profile', 'page')
  revalidatePath('/[locale]/coaches/[id]', 'page')
  return { ok: true }
}
