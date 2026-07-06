import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { getSetupChecklist, type SetupItemKey } from '@/lib/gym/setup-checklist'
import {
  Sparkles, Check, ChevronRight,
  Building2, Palette, Dumbbell, Users, CreditCard, Zap, DollarSign, UserPlus,
} from 'lucide-react'

/**
 * ONBOARDING-CHECKLIST — the derived first-run setup card on /today. Shown only
 * while setup is INCOMPLETE (returns null once every applicable item is done), so
 * a configured gym never sees it. Each row deep-links to the page that completes
 * it. DS-1/2/3: neutral tokens flip in dark, crimson uses text-primary-foreground,
 * and spacing/chevron are RTL-correct via logical props.
 */
const ITEM_META: Record<SetupItemKey, { icon: typeof Building2; href: (locale: string) => string }> = {
  profile:    { icon: Building2,   href: (l) => `/${l}/settings` },
  branding:   { icon: Palette,     href: (l) => `/${l}/settings` },
  discipline: { icon: Dumbbell,    href: (l) => `/${l}/disciplines` },
  coach:      { icon: Users,       href: (l) => `/${l}/coaches` },
  plan:       { icon: CreditCard,  href: (l) => `/${l}/settings?tab=plans` },
  ptpackage:  { icon: Zap,         href: (l) => `/${l}/settings?tab=ptpackages` },
  exchange:   { icon: DollarSign,  href: (l) => `/${l}/settings?tab=rates` },
  member:     { icon: UserPlus,    href: (l) => `/${l}/students/add` },
}

export async function SetupChecklist({ locale, gymId }: { locale: string; gymId: string }) {
  const supabase = await createClient()
  const { items, doneCount, total, allDone } = await getSetupChecklist(supabase, gymId)
  if (allDone) return null // hide once the gym is fully set up

  const t = await getTranslations('setupChecklist')
  const isRTL = locale === 'ar'

  return (
    <div data-testid="setup-checklist" data-done={doneCount} data-total={total} dir={isRTL ? 'rtl' : 'ltr'}
      className="rounded-2xl border border-[#cd1419]/20 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#cd1419]/10 text-primary-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</p>
        </div>
        <span data-testid="setup-progress" className="flex-shrink-0 text-xs font-medium text-gray-500">
          {t('progress', { done: doneCount, total })}
        </span>
      </div>

      <ul className="mt-3 space-y-1">
        {items.map((item) => {
          const Icon = ITEM_META[item.key].icon
          return (
            <li key={item.key}>
              <Link href={ITEM_META[item.key].href(locale)}
                data-testid={`setup-item-${item.key}`} data-done={item.done}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-gray-50">
                <span className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                  item.done ? 'bg-green-600 text-primary-foreground' : 'border-2 border-gray-200 text-gray-400')}>
                  {item.done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3" />}
                </span>
                <span className={cn('flex-1 text-sm', isRTL && 'font-arabic',
                  item.done ? 'text-gray-400 line-through' : 'text-gray-700')}>
                  {t(`items.${item.key}`)}
                </span>
                {!item.done && <ChevronRight className={cn('h-4 w-4 flex-shrink-0 text-gray-300', isRTL && 'rotate-180')} />}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
