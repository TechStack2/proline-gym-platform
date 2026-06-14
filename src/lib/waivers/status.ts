/**
 * F3 waiver status — pure, client-safe. "Current" = the latest signature whose
 * snapshotted template_version is >= the gym's active template version.
 */
export type WaiverState = 'none' | 'unsigned' | 'signed' | 'outdated'

/** none = no template configured; unsigned = never signed; outdated = signed an older version. */
export function waiverState(
  activeVersion: number | null | undefined,
  latestSignedVersion: number | null | undefined,
): WaiverState {
  if (activeVersion == null) return 'none'
  if (latestSignedVersion == null) return 'unsigned'
  return latestSignedVersion >= activeVersion ? 'signed' : 'outdated'
}

export type WaiverTemplateRow = {
  id: string; version: number; is_active: boolean
  title_ar: string; title_en: string; title_fr: string
  body_ar: string; body_en: string; body_fr: string
}

export function waiverTitle(t: Pick<WaiverTemplateRow, 'title_ar' | 'title_en' | 'title_fr'>, locale: string): string {
  return (locale === 'ar' ? t.title_ar : locale === 'fr' ? t.title_fr : t.title_en) || t.title_en || ''
}
export function waiverBody(t: Pick<WaiverTemplateRow, 'body_ar' | 'body_en' | 'body_fr'>, locale: string): string {
  return (locale === 'ar' ? t.body_ar : locale === 'fr' ? t.body_fr : t.body_en) || t.body_en || ''
}
