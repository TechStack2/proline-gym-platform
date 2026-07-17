import { describe, it, expect } from 'vitest'
import { composeInvoiceWa, invoiceDueParts, asLoc } from './wa-message'
import { waLink } from '@/lib/whatsapp/link'
import en from '@/i18n/messages/en.json'
import ar from '@/i18n/messages/ar.json'

// A minimal ICU-free formatter: our invoice templates use only simple {placeholder}
// tokens (no plural/select), so `{k}` → vars[k] faithfully mirrors what next-intl
// produces for these keys. `tw('tmpl.invoiceDue', vars)` resolves against the real
// message catalog — the same strings shipped to members.
const twFor = (msgs: any) => (key: string, vars: Record<string, string>) => {
  const [, sub] = key.split('.')
  const tmpl: string = msgs.whatsapp.tmpl[sub]
  return tmpl.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`))
}

const GYM = { slug: 'proline', name_en: 'PRO LINE Gym', name_ar: 'برو لاين جيم', name_fr: 'PRO LINE Gym' }
const MEMBER = { first_name_en: 'Karim', first_name_ar: 'كريم', phone: '03123456', locale: 'en' }
const GUARDIAN = { first_name_en: 'Rana', first_name_ar: 'رنا', phone: '70999888', locale: 'ar' }

describe('invoiceDueParts', () => {
  it('formats USD and a LBP suffix from the invoice exchange_rate', () => {
    expect(invoiceDueParts(50, 89000)).toEqual({ usd: '50.00', lbp: ' / 4,450,000 LBP' })
  })
  it('omits the LBP suffix with no/zero rate', () => {
    expect(invoiceDueParts(50, null)).toEqual({ usd: '50.00', lbp: '' })
    expect(invoiceDueParts(50, 0)).toEqual({ usd: '50.00', lbp: '' })
  })
})

describe('composeInvoiceWa', () => {
  const base = {
    gym: GYM, origin: 'https://proline.example.com',
    invoiceNumber: 'INV-2026-0007', invoiceType: 'membership',
    notes: { notes_en: 'March membership' }, balanceUsd: 50, exchangeRate: 89000,
  }

  it('builds a member-locale due body with number, gym, amount and a canonical portal link', () => {
    const out = composeInvoiceWa(twFor(en), { ...base, target: MEMBER, locale: 'en' })
    expect(out.phone).toBe('03123456')
    expect(out.due).toContain('INV-2026-0007')
    expect(out.due).toContain('PRO LINE Gym')
    expect(out.due).toContain('Karim')
    expect(out.due).toContain('50.00')
    expect(out.due).toContain('4,450,000 LBP')
    // Canonical host + member-locale portal billing link (R2/R4).
    expect(out.due).toContain('https://proline.example.com/en/portal/billing')
    // Reminder is the softer variant, same link/number.
    expect(out.reminder).toContain('INV-2026-0007')
    expect(out.reminder).toContain('https://proline.example.com/en/portal/billing')
  })

  it('addresses a guardian-billed invoice to the payer in the payer locale (ar)', () => {
    const out = composeInvoiceWa(twFor(ar), { ...base, target: GUARDIAN, locale: 'ar' })
    expect(out.phone).toBe('70999888') // the guardian's number, not the member's
    expect(out.due).toContain('رنا') // greets the guardian by name
    expect(out.due).toContain('برو لاين جيم') // gym name in Arabic
    expect(out.due).toContain('https://proline.example.com/ar/portal/billing')
  })

  it('returns a null phone when the recipient has none on file (→ guidance, not a dead link)', () => {
    const out = composeInvoiceWa(twFor(en), { ...base, target: { first_name_en: 'X', phone: null, locale: 'en' }, locale: 'en' })
    expect(out.phone).toBeNull()
  })
})

describe('waLink encoding (the Arabic + newline trap)', () => {
  it('percent-encodes an Arabic multi-line body so it survives the wa.me URL', () => {
    const body = composeInvoiceWa(twFor(ar), {
      gym: GYM, origin: 'https://proline.example.com', invoiceNumber: 'INV-9',
      invoiceType: 'membership', notes: { notes_ar: 'اشتراك آذار' }, balanceUsd: 25, exchangeRate: 89000,
      target: GUARDIAN, locale: 'ar',
    }).due
    const withNewlines = `${body}\nشكراً`
    const href = waLink('70999888', withNewlines)
    // Country code applied, no '+', text param present.
    expect(href.startsWith('https://wa.me/96170999888?text=')).toBe(true)
    // Newline encoded, and the exact Arabic body round-trips out of the URL.
    expect(href).toContain('%0A')
    const text = decodeURIComponent(href.split('?text=')[1])
    expect(text).toBe(withNewlines)
  })

  it('normalizes a local 0-prefixed number to the Lebanon country code (trunk 0 → 961)', () => {
    expect(waLink('03123456', 'hi')).toBe(`https://wa.me/9613123456?text=hi`)
  })

  it('returns empty (no link) without a phone', () => {
    expect(waLink(null, 'hi')).toBe('')
  })
})

describe('asLoc', () => {
  it('coerces to a supported locale, defaulting to en', () => {
    expect(asLoc('ar')).toBe('ar')
    expect(asLoc('fr')).toBe('fr')
    expect(asLoc('de')).toBe('en')
    expect(asLoc(null)).toBe('en')
  })
})
