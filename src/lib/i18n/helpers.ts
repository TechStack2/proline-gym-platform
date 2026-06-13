import { dateLocale } from '@/lib/utils/locale-format';
/**
 * i18n Shared Helpers
 * 
 * Centralized utilities for localized display of multi-language database fields.
 * Use these instead of inline `locale === 'ar' ? x.name_ar : locale === 'fr' ? x.name_fr : x.name_en`.
 */

export interface LocalizedNameFields {
  name_ar?: string | null;
  name_en?: string | null;
  name_fr?: string | null;
}

/**
 * Resolve the best available localized name for an item from its
 * `name_ar` / `name_en` / `name_fr` fields. Falls back through
 * available languages when the primary locale field is null/empty.
 */
export function getLocalizedName(
  item: LocalizedNameFields,
  locale: string,
): string {
  if (locale === 'ar') return item.name_ar || item.name_en || '';
  if (locale === 'fr') return item.name_fr || item.name_en || '';
  return item.name_en || item.name_ar || '';
}

/**
 * Map a Next.js locale string to a BCP 47 locale tag suitable for
 * `Date.toLocaleDateString()` and similar Intl APIs.
 */
export function getDateLocale(locale: string): string {
  // AX-1 convention: delegate to the canonical helper (Western digits via
  // -u-nu-latn; localized month/day names).
  return dateLocale(locale);
}
