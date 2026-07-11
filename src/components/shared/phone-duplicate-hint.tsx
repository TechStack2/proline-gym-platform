'use client'

/**
 * MJ-2 soft duplicate hint. When a typed phone already belongs to ANOTHER profile
 * in the gym, show an informational chip ("also used by <name> — families can
 * share"). It NEVER blocks: a phone is non-unique by design (families share one
 * number); the ratified invariant only bites at INVITE time (one credential per
 * phone per gym), enforced in the invite path — capture is always allowed.
 *
 * Client-only, debounced, self-scoped to the caller's gym (staff RLS). Renders
 * nothing until a real match surfaces.
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone, phoneMatchVariants } from '@/lib/utils/phone'
import { Users } from 'lucide-react'

export function PhoneDuplicateHint({
  gymId, phone, excludeProfileId, locale,
}: {
  gymId: string
  phone: string
  excludeProfileId?: string | null
  locale: string
}) {
  const t = useTranslations('common')
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    const norm = normalizePhone(phone)
    if (!gymId || !norm) { setNames([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr')
        .eq('gym_id', gymId)
        .in('phone', phoneMatchVariants(norm))
        .limit(4)
      if (cancelled) return
      const found = (data ?? [])
        .filter((p) => p.id !== excludeProfileId)
        .map((p) => {
          const fn = locale === 'ar' ? p.first_name_ar : locale === 'fr' ? p.first_name_fr : p.first_name_en
          const ln = locale === 'ar' ? p.last_name_ar : locale === 'fr' ? p.last_name_fr : p.last_name_en
          return [fn || p.first_name_en, ln || p.last_name_en].filter(Boolean).join(' ').trim()
        })
        .filter(Boolean)
      setNames(found)
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [gymId, phone, excludeProfileId, locale])

  if (names.length === 0) return null
  return (
    <div
      data-testid="phone-dup-hint"
      className="mt-1.5 flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
    >
      <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{t('phoneAlsoUsedBy', { name: names.slice(0, 2).join(', ') })}</span>
    </div>
  )
}
