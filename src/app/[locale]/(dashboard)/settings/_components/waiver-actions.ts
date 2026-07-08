'use server'

/**
 * F3 waiver TEMPLATE editor actions (staff). The template is gym-configurable
 * DATA (tenant-clean); ONE row per gym (000057 unique). Editing the BODY in any
 * locale BUMPS `version` so existing signatures become "outdated" and trigger a
 * re-sign; a title-only edit does not. Writes ride the caller's staff RLS
 * (waiver_templates_staff_*). No service-role needed — nothing here is secret.
 */
import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/errors/action-error';

const STAFF = ['owner', 'head_coach', 'receptionist']

async function staffGym(): Promise<{ gymId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: role } = await supabase.from('user_roles').select('role, gym_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!role || !STAFF.includes(role.role)) return null
  return { gymId: role.gym_id }
}

export type WaiverTemplate = {
  id: string; version: number; isActive: boolean
  titleAr: string; titleEn: string; titleFr: string
  bodyAr: string; bodyEn: string; bodyFr: string
} | null

export async function getWaiverTemplate(): Promise<WaiverTemplate> {
  const ctx = await staffGym()
  if (!ctx) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('waiver_templates')
    .select('id, version, is_active, title_ar, title_en, title_fr, body_ar, body_en, body_fr')
    .eq('gym_id', ctx.gymId).maybeSingle()
  if (!data) return null
  return {
    id: data.id, version: data.version, isActive: data.is_active,
    titleAr: data.title_ar, titleEn: data.title_en, titleFr: data.title_fr,
    bodyAr: data.body_ar, bodyEn: data.body_en, bodyFr: data.body_fr,
  }
}

export async function saveWaiverTemplate(input: {
  titleAr: string; titleEn: string; titleFr: string
  bodyAr: string; bodyEn: string; bodyFr: string; isActive: boolean
}): Promise<{ ok: true; version: number; bumped: boolean } | { ok: false; error: string }> {
  const ctx = await staffGym()
  if (!ctx) return { ok: false, error: 'forbidden' }
  const supabase = await createClient()

  const row = {
    title_ar: input.titleAr.trim(), title_en: input.titleEn.trim(), title_fr: input.titleFr.trim(),
    body_ar: input.bodyAr.trim(), body_en: input.bodyEn.trim(), body_fr: input.bodyFr.trim(),
    is_active: input.isActive,
  }

  const { data: existing } = await supabase
    .from('waiver_templates').select('id, version, body_ar, body_en, body_fr').eq('gym_id', ctx.gymId).maybeSingle()

  if (!existing) {
    const { error } = await supabase.from('waiver_templates').insert({ gym_id: ctx.gymId, ...row, version: 1 })
    if (error) return { ok: false, error: actionError(error) }
    return { ok: true, version: 1, bumped: false }
  }

  // Editing the BODY (any locale) bumps the version → existing signatures outdate.
  const bumped = existing.body_ar !== row.body_ar || existing.body_en !== row.body_en || existing.body_fr !== row.body_fr
  const version = bumped ? existing.version + 1 : existing.version
  const { error } = await supabase.from('waiver_templates')
    .update({ ...row, version, updated_at: new Date().toISOString() }).eq('id', existing.id)
  if (error) return { ok: false, error: actionError(error) }
  return { ok: true, version, bumped }
}
