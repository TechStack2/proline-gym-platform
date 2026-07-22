'use client'

/**
 * MJ-1 FAMILY-DOOR — the member's portal-login control on Member-360 (staff-only).
 *
 * Two things in one place, because they're one decision:
 *  · the ELIGIBILITY toggle — Default (by age) / Can log in / Guardian holds access
 *    → students.portal_login_override = NULL / TRUE / FALSE. Honest copy spells out
 *    what "Default" resolves to for THIS member's age.
 *  · the INVITE affordance — enabled only when the member is effectively eligible.
 *    An ineligible member (a minor with no override, or a staff "guardian holds
 *    access" decision) shows a disabled explainer that points to the guardian panel:
 *    the guardian is the family's door, so you invite THEM, not the child.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { ShieldCheck, Users } from 'lucide-react'
import { InviteButton } from '@/components/shared/invite-button'
import { setPortalLoginOverride } from './portal-access-actions'

/** Effective eligibility: an explicit override wins; else DOB>=18 (no DOB → adult). */
export function isPortalEligible(override: boolean | null, age: number | null): boolean {
  if (override !== null && override !== undefined) return override
  return age == null ? true : age >= 18
}

type OverrideChoice = 'default' | 'yes' | 'no'
const toValue = (c: OverrideChoice): boolean | null => (c === 'default' ? null : c === 'yes')
const toChoice = (v: boolean | null): OverrideChoice => (v === null || v === undefined ? 'default' : v ? 'yes' : 'no')

export function MemberPortalAccess({
  studentId, name, locale, phone, override, age,
}: {
  studentId: string
  name: string
  locale: string
  phone: string | null
  override: boolean | null
  age: number | null
}) {
  const t = useTranslations('family.access')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<OverrideChoice>(toChoice(override))

  const eligible = isPortalEligible(toValue(choice), age)
  const ageDefaultsEligible = age == null ? true : age >= 18

  const pick = (c: OverrideChoice) => {
    if (c === choice) return
    setChoice(c) // optimistic
    startTransition(async () => {
      const res = await setPortalLoginOverride(studentId, toValue(c))
      if (!res.ok) setChoice(toChoice(override)) // rollback on failure
      router.refresh()
    })
  }

  const chips: { key: OverrideChoice; label: string }[] = [
    { key: 'default', label: t('byAge') },
    { key: 'yes', label: t('canLogin') },
    { key: 'no', label: t('guardianHolds') },
  ]

  return (
    <div className="flex w-full flex-col items-end gap-2 rounded-xl border border-gray-100 p-3" data-testid="portal-access">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-600" /> {t('title')}
        </span>
      </div>
      {/* Guided tri-state, no dropdown (FORM-FOCUS). */}
      <div className="flex flex-wrap justify-end gap-1.5" data-testid="portal-eligibility" data-value={choice}>
        {chips.map((c) => (
          <button key={c.key} type="button" data-testid={`portal-eligibility-${c.key}`} data-active={choice === c.key}
            disabled={pending} onClick={() => pick(c.key)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50',
              choice === c.key ? 'border-primary-700 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="w-full text-end text-[11px] text-gray-400">
        {choice === 'default' ? (ageDefaultsEligible ? t('defaultHintAdult') : t('defaultHintMinor')) : choice === 'yes' ? t('yesHint') : t('noHint')}
      </p>

      {eligible ? (
        <InviteButton kind="student" id={studentId} name={name} locale={locale} phone={phone} />
      ) : (
        <div className="tint-warning flex w-full flex-col items-end gap-1 rounded-lg px-3 py-2 text-right" data-testid="invite-blocked-guardian">
          <span className="text-xs font-medium">{t('blockedTitle')}</span>
          <span className="text-[11px]">{t('blockedBody')}</span>
          <a href="#panel-guardians" data-testid="invite-blocked-to-guardians"
            className="inline-flex items-center gap-1 text-xs font-semibold underline">
            <Users className="h-3 w-3" /> {t('toGuardians')}
          </a>
        </div>
      )}
    </div>
  )
}
