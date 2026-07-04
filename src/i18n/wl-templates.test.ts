import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import en from './messages/en.json'
import ar from './messages/ar.json'
import fr from './messages/fr.json'

/**
 * WL-TEMPLATES — the member-facing whatsapp.tmpl.* bodies (renewal / winback /
 * receipt / leadReply / regApproved) interpolate the SENDING gym's name, not a
 * hardcoded "PRO LINE". Rendered with next-intl (the exact runtime path): a
 * non-Proline gym carries ITS name and never "PRO LINE"; the demo gym carries
 * Proline's own name (byte-identical brand). Complements g1, which proves the
 * receipt + leadReply render the gym's name end-to-end in the app.
 */
const MESSAGES = { en, ar, fr } as const
const KEYS = ['renewal', 'winback', 'receipt', 'leadReply', 'regApproved'] as const
// A superset of every template's placeholders (extras are ignored; a missing one throws).
const BASE = { name: 'Sara', number: 'INV-1042', usd: '40.00', lbp: '', class: 'Boxing' }
const WL = { en: 'Iron Fist Club', ar: 'نادي القبضة الحديدية', fr: 'Club Poing de Fer' }
const PROLINE = { en: 'PRO LINE Gym', ar: 'برو لاين جيم', fr: 'PRO LINE Gym' }

for (const locale of ['en', 'ar', 'fr'] as const) {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'whatsapp.tmpl' })
  describe(`WL-TEMPLATES · ${locale}`, () => {
    for (const key of KEYS) {
      it(`${key}: a non-Proline gym carries ITS name, never "PRO LINE"`, () => {
        const wl = t(key as any, { ...BASE, gym: WL[locale] } as any) as string
        expect(wl, 'carries the WL gym name').toContain(WL[locale])
        expect(wl, 'no hardcoded en brand').not.toContain('PRO LINE')
        expect(wl, 'no hardcoded ar brand (spaced)').not.toContain('برو لاين')
        expect(wl, 'the member name still renders').toContain('Sara')
      })
      it(`${key}: the demo gym carries Proline's own name (byte-identical brand)`, () => {
        const demo = t(key as any, { ...BASE, gym: PROLINE[locale] } as any) as string
        expect(demo).toContain(PROLINE[locale])
      })
    }
  })
}
