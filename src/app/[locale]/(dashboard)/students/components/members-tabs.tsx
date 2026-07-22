import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { segmentedItemCls, segmentedTrayCls } from '@/components/ui/segmented'

/**
 * The Members-workspace tab strip (Active | Prospects | Guardians). Extracted so
 * the roster, the lead pipeline and the new GUARDIAN-360 views share ONE source
 * of truth for the tabs — testids (`members-tabs`, `tab-active`, `tab-prospects`)
 * are preserved; `tab-guardians` is additive. Guardians is a sibling route
 * (`/students/guardians`), not a `?tab=` param, so its detail pages nest cleanly.
 */
export async function MembersTabs({
  active, locale,
}: {
  active: 'active' | 'prospects' | 'guardians'
  locale: string
}) {
  const t = await getTranslations('students')
  const item = (href: string, testid: string, label: string, on: boolean) => (
    <Link href={href} data-testid={testid}
      className={segmentedItemCls(on)}>
      {label}
    </Link>
  )
  return (
    <div className={segmentedTrayCls} data-testid="members-tabs">
      {item(`/${locale}/students`, 'tab-active', t('tabs_active'), active === 'active')}
      {item(`/${locale}/students?tab=prospects`, 'tab-prospects', t('tabs_prospects'), active === 'prospects')}
      {item(`/${locale}/students/guardians`, 'tab-guardians', t('tabs_guardians'), active === 'guardians')}
    </div>
  )
}
