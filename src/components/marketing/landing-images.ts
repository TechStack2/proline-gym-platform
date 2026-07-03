/**
 * LANDING-CONTENT — shared shape for the per-gym landing image sections
 * (Champions / Gallery / Affiliations). Each section reads its gym's rows via the
 * `get_landing_images(gym, section)` SECURITY DEFINER RPC (000079); ZERO rows →
 * the section falls back to its built-in Proline set, byte-identical to before.
 */
export type LandingImageRow = {
  id: string;
  image_url: string;
  caption_ar: string | null;
  caption_en: string | null;
  caption_fr: string | null;
  sort_order: number;
};

/** Localized caption with an English fallback (the page.tsx `pick` convention). */
export function pickCaption(row: LandingImageRow, locale: string): string {
  return (
    (locale === 'ar' ? row.caption_ar : locale === 'fr' ? row.caption_fr : row.caption_en) ||
    row.caption_en ||
    ''
  );
}
