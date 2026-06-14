import 'server-only'
/**
 * F3 — server helper to resolve a student's waiver context (the active template
 * + the member's signing status) under the CALLER's RLS. A guardian reads via
 * is_guardian_of, the member via their own student row, staff via gym scope —
 * all through waiver_templates_read / waiver_signatures_read (000057). Returns
 * `none` when the gym has no active template.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { localizedName, one } from '@/lib/names'
import { waiverState, type WaiverState, type WaiverTemplateRow } from './status'

export type WaiverContext = {
  template: WaiverTemplateRow | null
  state: WaiverState
  signedVersion: number | null
  signedAt: string | null
  signedByName: string | null
  /** base64 PNG data-URL of the latest signature — only when includeArtifact (staff/Member-360). */
  signature: string | null
}

export async function getWaiverContext(
  supabase: SupabaseClient,
  studentId: string,
  gymId: string,
  opts: { locale?: string; includeArtifact?: boolean } = {},
): Promise<WaiverContext> {
  const sigCols = `template_version, signed_at, signed_by_profile_id${opts.includeArtifact ? ', signature' : ''},
    signer:profiles!waiver_signatures_signed_by_profile_id_fkey (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)`
  const [{ data: tmpl }, { data: sig }] = await Promise.all([
    supabase
      .from('waiver_templates')
      .select('id, version, is_active, title_ar, title_en, title_fr, body_ar, body_en, body_fr')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('waiver_signatures')
      .select(sigCols)
      .eq('student_id', studentId)
      .order('template_version', { ascending: false })
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const activeVersion = (tmpl as any)?.version ?? null
  const signedVersion = (sig as any)?.template_version ?? null
  return {
    template: (tmpl as WaiverTemplateRow | null) ?? null,
    state: waiverState(activeVersion, signedVersion),
    signedVersion,
    signedAt: (sig as any)?.signed_at ?? null,
    signedByName: sig ? (localizedName(one((sig as any).signer), opts.locale ?? 'en') || null) : null,
    signature: opts.includeArtifact ? ((sig as any)?.signature ?? null) : null,
  }
}
