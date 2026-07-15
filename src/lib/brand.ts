/**
 * PRAXELLA-DOOR — the ONE place the platform's own brand lives.
 *
 * The brand is a TEXT LOGOTYPE today (no logo asset yet). Everything on the
 * vendor marketing surface + the vendor console derives its wordmark from
 * `PLATFORM_BRAND.name` and its strapline from `PLATFORM_BRAND.tagline`, so
 * dropping in a logo or renaming the platform is a one-line change here — no
 * page edits. Marketing section copy stays in i18n (`vendor` namespace); only
 * the brand identity itself is centralized here.
 *
 * `rootDomain` is the platform's apex host — praxella.com serves the vendor
 * landing; <slug>.praxella.com serves a gym's landing (see lib/host/resolver).
 */
export const PLATFORM_BRAND = {
  name: 'Praxella',
  tagline: 'Run your gym, not your spreadsheets.',
  rootDomain: 'praxella.com',
} as const;
