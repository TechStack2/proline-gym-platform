import { categoryForType, type PushCategory } from './category'

/**
 * PUSH-1 — the wire payload for a web-push message.
 *
 * PII-LIGHT by design: lockscreens are public, so the payload carries a
 * category-generic title/body + a deep link ONLY — never the member's name, the
 * amount, or the specific class. The recipient opens the app (via the link) to
 * see the specifics behind their own auth. Copy is localized to the recipient's
 * profile locale; unknown locales fall back to English.
 */
export type PushPayload = {
  title: string
  body: string
  /** deep-link opened by the SW notificationclick handler. */
  url: string
  category: PushCategory
  tag: string
}

type Locale = 'en' | 'ar' | 'fr'
const asLocale = (l: string | null | undefined): Locale => (l === 'ar' || l === 'fr' ? l : 'en')

// Generic, PII-free copy per category. Title is the platform; body says only the
// KIND of update. Deliberately vague — the app reveals the detail behind auth.
const COPY: Record<PushCategory, Record<Locale, { title: string; body: string }>> = {
  operational: {
    en: { title: 'Proline', body: 'New activity at your gym — open to view.' },
    ar: { title: 'برولاين', body: 'نشاط جديد في ناديك — افتح للعرض.' },
    fr: { title: 'Proline', body: 'Nouvelle activité à votre salle — ouvrir pour voir.' },
  },
  schedule: {
    en: { title: 'Proline', body: 'A reminder is waiting — open to view.' },
    ar: { title: 'برولاين', body: 'لديك تذكير — افتح للعرض.' },
    fr: { title: 'Proline', body: 'Un rappel vous attend — ouvrir pour voir.' },
  },
  informational: {
    en: { title: 'Proline', body: 'A billing update — open to view.' },
    ar: { title: 'برولاين', body: 'تحديث في الفوترة — افتح للعرض.' },
    fr: { title: 'Proline', body: 'Mise à jour de facturation — ouvrir pour voir.' },
  },
}

/**
 * Build the PII-light payload for a notification row. `action_url` is the deep
 * link; when absent the recipient is dropped on the in-app notifications page.
 */
export function buildPushPayload(
  notification: { type?: string | null; action_url?: string | null; id?: string | null },
  locale: string | null | undefined,
): PushPayload {
  const category = categoryForType(notification.type)
  const l = asLocale(locale)
  const copy = COPY[category][l]
  return {
    title: copy.title,
    body: copy.body,
    url: notification.action_url || '/notifications',
    category,
    // one visible notification per category — a new op update replaces the last,
    // so a burst of activity doesn't stack a wall of identical lockscreen cards.
    tag: `proline-${category}`,
  }
}
