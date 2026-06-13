/**
 * AX-1 numeral/date convention (stated once, used everywhere):
 * WESTERN (Latin) digits in all three locales — Lebanese convention and the
 * only digit set that matches the DB-rendered amounts/phone numbers around
 * them — with LOCALIZED month/day names (ar-LB month names, fr-FR, en-US).
 * `ar-LB` alone renders Arabic-Indic digits (٠١٢…); the `-u-nu-latn` Unicode
 * extension keeps the names Arabic and the digits Western.
 */
export function dateLocale(locale: string): string {
  return locale === 'ar' ? 'ar-LB-u-nu-latn' : locale === 'fr' ? 'fr-FR' : 'en-US'
}
