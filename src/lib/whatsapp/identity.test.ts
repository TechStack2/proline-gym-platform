import { describe, it, expect } from 'vitest'
import {
  gymDisplayName,
  gymContactPhone,
  whatsappFooter,
  whatsappTestBody,
  dunningReminderBody,
  type MessagingGym,
} from './identity'
import en from '@/i18n/messages/en.json'
import ar from '@/i18n/messages/ar.json'
import fr from '@/i18n/messages/fr.json'

/**
 * WL-IDENTITY — tenant-agnostic messaging is sourced from the SENDING gym, not a
 * hardcoded "PRO LINE". A NON-Proline gym's members/staff see THAT gym's name (and
 * phone where applicable); the demo — and any gym leaving a field unset — renders
 * today's PRO LINE strings byte-identically (the fallback path).
 */

// A non-Proline white-label gym (000078 contact_phone set).
const WL: MessagingGym = {
  name_ar: 'نادي القبضة الحديدية',
  name_en: 'Iron Fist Club',
  name_fr: 'Club Poing de Fer',
  contact_phone: '+961 1 999888',
}
// The demo gym as it exists in the row (000006 seed values).
const PROLINE: MessagingGym = {
  name_ar: 'برو لاين جيم',
  name_en: 'PRO LINE Gym',
  name_fr: 'PRO LINE Gym',
  phone: '+961 70 628 601',
}

const noProline = (s: string) => {
  expect(s).not.toContain('PRO LINE')
  expect(s).not.toContain('برو لاين')
  expect(s).not.toContain('برولاين')
}

describe('gymDisplayName / gymContactPhone', () => {
  it('returns the gym localized name for a WL gym (no PRO LINE)', () => {
    expect(gymDisplayName(WL, 'en')).toBe('Iron Fist Club')
    expect(gymDisplayName(WL, 'ar')).toBe('نادي القبضة الحديدية')
    expect(gymDisplayName(WL, 'fr')).toBe('Club Poing de Fer')
    noProline(gymDisplayName(WL, 'en'))
    noProline(gymDisplayName(WL, 'ar'))
  })

  it('falls back to the built-in PRO LINE default byte-identically (null / unset)', () => {
    expect(gymDisplayName(null, 'en')).toBe('PRO LINE Gym')
    expect(gymDisplayName(null, 'ar')).toBe('برو لاين جيم')
    expect(gymDisplayName(null, 'fr')).toBe('PRO LINE Gym')
    // A resolved demo gym renders its own (identical) name.
    expect(gymDisplayName(PROLINE, 'en')).toBe('PRO LINE Gym')
    expect(gymDisplayName(PROLINE, 'ar')).toBe('برو لاين جيم')
    // Localized-name unset → the gym's English name, then the default.
    expect(gymDisplayName({ name_en: 'Solo Gym' }, 'ar')).toBe('Solo Gym')
  })

  it('resolves the contact phone (contact_phone → phone → default)', () => {
    expect(gymContactPhone(WL)).toBe('+961 1 999888')
    expect(gymContactPhone(PROLINE)).toBe('+961 70 628 601')
    expect(gymContactPhone(null)).toBe('+961 70 628 601')
    // contact_phone (000078) wins over the base phone.
    expect(gymContactPhone({ contact_phone: '+961 3 111222', phone: '+961 70 628 601' })).toBe('+961 3 111222')
  })
})

describe('#1 WhatsApp template footers (whatsappFooter)', () => {
  it('signs a WL footer with the gym name + phone (not PRO LINE)', () => {
    expect(whatsappFooter(WL, 'en', { withPhone: true })).toBe('Iron Fist Club — +961 1 999888')
    noProline(whatsappFooter(WL, 'ar', { withPhone: true }))
    expect(whatsappFooter(WL, 'en')).toBe('Iron Fist Club') // name-only footer
  })
  it('the default footer is byte-identical to today (types.ts literals)', () => {
    // trial_confirmation / welcome_lead footers → "<name> — <phone>"
    expect(whatsappFooter(null, 'en', { withPhone: true })).toBe('PRO LINE Gym — +961 70 628 601')
    expect(whatsappFooter(null, 'ar', { withPhone: true })).toBe('برو لاين جيم — +961 70 628 601')
    // class_reminder / camp_registration footers → "<name>"
    expect(whatsappFooter(null, 'en')).toBe('PRO LINE Gym')
  })
})

describe('#2 dunning reminder copy (dunningReminderBody)', () => {
  const base = { member_name: 'Sara', amount_usd: 40 }
  it('signs with the WL gym name across locales (not PRO LINE) + keeps name/amount', () => {
    const enBody = dunningReminderBody({ ...base, member_locale: 'en', nudge: 'overdue' }, WL)
    expect(enBody).toContain('Iron Fist Club')
    expect(enBody).toContain('Sara')
    expect(enBody).toContain('$40')
    expect(enBody.trimEnd().endsWith('Thanks — Iron Fist Club.')).toBe(true)
    noProline(enBody)
    noProline(dunningReminderBody({ ...base, member_locale: 'ar', nudge: 'overdue' }, WL))
    noProline(dunningReminderBody({ ...base, member_locale: 'fr', nudge: 'upcoming' }, WL))
    expect(dunningReminderBody({ ...base, member_locale: 'ar', nudge: 'upcoming' }, WL))
      .toContain('نادي القبضة الحديدية')
  })
  it('a resolved demo gym signs with its own name (fallback stays PRO LINE)', () => {
    expect(dunningReminderBody({ ...base, member_locale: 'en', nudge: 'overdue' }, PROLINE))
      .toContain('PRO LINE Gym')
    // Null gym → the built-in default name (never an empty signature).
    expect(dunningReminderBody({ ...base, member_locale: 'en', nudge: 'overdue' }, null))
      .toContain('PRO LINE Gym')
  })
})

describe('#4 settings test message (whatsappTestBody)', () => {
  it('signs with the WL gym name; default is byte-identical', () => {
    expect(whatsappTestBody(WL)).toBe('Iron Fist Club — WhatsApp test message ✅')
    noProline(whatsappTestBody(WL))
    expect(whatsappTestBody(null)).toBe('PRO LINE Gym — WhatsApp test message ✅')
    expect(whatsappTestBody(PROLINE)).toBe('PRO LINE Gym — WhatsApp test message ✅')
  })
})

describe('#3 invite message is tenant-agnostic (i18n {gym} placeholder)', () => {
  for (const [locale, msgs] of [['en', en], ['ar', ar], ['fr', fr]] as const) {
    it(`invite.waMessage[${locale}] uses {gym}, no hardcoded PRO LINE`, () => {
      const wa = (msgs as any).invite.waMessage as string
      expect(wa).toContain('{gym}')
      expect(wa).toContain('{url}')
      expect(wa).toContain('{temp}')
      noProline(wa)
    })
  }
})
