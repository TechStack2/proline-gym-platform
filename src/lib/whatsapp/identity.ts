/**
 * WL-IDENTITY — the gym's messaging identity, sourced from the gym row.
 *
 * Tenant-agnostic messaging (WhatsApp footers, dunning sign-offs, the settings
 * test message) must sign with the SENDING gym's name/phone, not a hardcoded
 * "PRO LINE". These are PURE helpers (no server-only) so both server modules and
 * the unit guard can use them. Every fallback is the current PRO LINE default, so
 * the demo — and any gym that leaves a field unset — renders byte-identically.
 */
export type MessagingGym = {
  name_ar?: string | null
  name_en?: string | null
  name_fr?: string | null
  contact_phone?: string | null // 000078 public contact phone
  phone?: string | null // gyms.phone (legacy/base)
}

type Loc = 'ar' | 'en' | 'fr'
const loc = (l: string): Loc => (l === 'ar' ? 'ar' : l === 'fr' ? 'fr' : 'en')

// The built-in default identity (the demo gym) — the byte-identical fallback.
const DEFAULT_NAME: Record<Loc, string> = { ar: 'برو لاين جيم', en: 'PRO LINE Gym', fr: 'PRO LINE Gym' }
const DEFAULT_PHONE = '+961 70 628 601'

/** The gym's localized display name for member/staff messaging. Falls back to the
 *  gym's English name, then the built-in PRO LINE default (demo byte-identical). */
export function gymDisplayName(gym: MessagingGym | null | undefined, locale: string): string {
  const L = loc(locale)
  const localized = gym ? (L === 'ar' ? gym.name_ar : L === 'fr' ? gym.name_fr : gym.name_en) : null
  return localized?.trim() || gym?.name_en?.trim() || DEFAULT_NAME[L]
}

/** The gym's public contact phone (000078 contact_phone → gyms.phone → default). */
export function gymContactPhone(gym: MessagingGym | null | undefined): string {
  return gym?.contact_phone?.trim() || gym?.phone?.trim() || DEFAULT_PHONE
}

/** A WhatsApp template footer from the gym identity: "<name>" or "<name> — <phone>".
 *  The default gym yields today's literal footer (e.g. "PRO LINE Gym — +961 70 628 601"). */
export function whatsappFooter(
  gym: MessagingGym | null | undefined,
  locale: string,
  opts?: { withPhone?: boolean },
): string {
  const name = gymDisplayName(gym, locale)
  return opts?.withPhone ? `${name} — ${gymContactPhone(gym)}` : name
}

/** The settings "send a test message" body — signed with the gym's name. */
export function whatsappTestBody(gym: MessagingGym | null | undefined, locale = 'en'): string {
  return `${gymDisplayName(gym, locale)} — WhatsApp test message ✅`
}

export type DunningReminderInput = {
  member_name: string | null
  amount_usd: number
  member_locale: string
  nudge: 'upcoming' | 'overdue'
}

/** The member-locale dunning reminder body (name + amount), signed with the gym's
 *  localized name. Kept plain-text (the Cloud-API text path). Moved out of
 *  auto-dun.ts (server-only) so it's unit-testable against a non-Proline gym. */
export function dunningReminderBody(r: DunningReminderInput, gym: MessagingGym | null | undefined): string {
  const name = r.member_name || ''
  const amt = `$${Number(r.amount_usd ?? 0).toFixed(0)}`
  const L = loc(r.member_locale)
  const sig = gymDisplayName(gym, L)
  if (r.nudge === 'overdue') {
    return L === 'ar'
      ? `مرحباً ${name}، لديك دفعة تجديد متأخرة بقيمة ${amt}. يرجى التجديد في النادي. شكراً — ${sig}.`
      : L === 'fr'
        ? `Bonjour ${name}, votre renouvellement de ${amt} est en retard. Merci de régler à la salle. — ${sig}.`
        : `Hi ${name}, your ${amt} renewal is overdue. Please settle it at the gym. Thanks — ${sig}.`
  }
  return L === 'ar'
    ? `مرحباً ${name}، اقترب موعد تجديد اشتراكك (${amt}). يمكنك التجديد في النادي. — ${sig}.`
    : L === 'fr'
      ? `Bonjour ${name}, votre renouvellement (${amt}) arrive bientôt. Vous pouvez régler à la salle. — ${sig}.`
      : `Hi ${name}, your renewal (${amt}) is coming up. You can renew at the gym. — ${sig}.`
}
