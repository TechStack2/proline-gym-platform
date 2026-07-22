'use client'

/**
 * STAFF-MGMT — the team/access list. Unlike the coaches roster (the `coaches` table),
 * this reads user_roles so it shows ALL staff — owner, head_coach, coach AND
 * receptionist — a newly-invited receptionist appears here immediately. Owner/
 * head_coach viewers get a per-member deactivate/reactivate control (the server RPC
 * re-gates + enforces the guardrails; the button just can't target yourself).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, UserX, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/shared/avatar'
import { StatusChip } from '@/components/ui/status-chip'
import { setStaffActive } from '../staff-actions'
import { useErrorText } from '@/lib/errors/use-error-text';

export type StaffMember = {
  userId: string
  name: string
  avatarUrl: string | null
  roles: string[]
  isActive: boolean
}

const ROLE_LABEL: Record<string, { en: string; ar: string; fr: string }> = {
  owner: { en: 'Owner', ar: 'مالك', fr: 'Propriétaire' },
  head_coach: { en: 'Head Coach', ar: 'مدرب رئيسي', fr: 'Entraîneur en chef' },
  coach: { en: 'Coach', ar: 'مدرب', fr: 'Entraîneur' },
  receptionist: { en: 'Reception', ar: 'استقبال', fr: 'Réception' },
}

export function StaffAccessList({
  staff, canManage, currentUserId, locale,
}: {
  staff: StaffMember[]
  canManage: boolean
  currentUserId: string
  locale: string
}) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const roleLabel = (r: string) => ROLE_LABEL[r]?.[(locale as 'en' | 'ar' | 'fr')] ?? ROLE_LABEL[r]?.en ?? r
  const router = useRouter()
  const errText = useErrorText();
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const toggle = (m: StaffMember) => {
    setError(''); setBusyId(m.userId)
    startTransition(async () => {
      const res = await setStaffActive(m.userId, !m.isActive)
      setBusyId('')
      if (!res.ok) { setError(errText(res.error)); return }
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" data-testid="staff-access-list" dir={isRTL ? 'rtl' : 'ltr'}>
      <h2 className={cn('mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
        <ShieldCheck className="h-4 w-4 text-primary-700" /> {t('Team & access', 'الفريق والوصول', 'Équipe et accès')}
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        {t('Everyone with a staff login. Deactivate to retire access without deleting history.',
          'كل من لديه دخول موظف. عطّل الوصول للمتقاعدين دون حذف السجل.',
          "Toute personne avec un accès staff. Désactivez pour retirer l'accès sans supprimer l'historique.")}
      </p>
      {error && <div data-testid="staff-error" className="tint-danger mb-2 rounded-md px-3 py-2 text-sm">{error}</div>}
      <ul className="divide-y divide-gray-100">
        {staff.map((m) => (
          <li key={m.userId} data-testid="staff-row" data-user-id={m.userId} data-active={m.isActive ? '1' : '0'}
            className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar url={m.avatarUrl} name={m.name || '—'} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900" data-testid="staff-name">{m.name || '—'}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {m.roles.map((r) => (
                    <span key={r} data-testid="staff-role" data-role={r}
                      className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-2xs font-medium text-gray-600">
                      {roleLabel(r)}
                    </span>
                  ))}
                  {/* W3b §2.3: ONE status chip — hue from the member vocabulary; the
                      historical trilingual labels stay via the override. */}
                  <StatusChip domain="member" status={m.isActive ? 'active' : 'inactive'} size="sm"
                    label={m.isActive ? t('Active', 'نشط', 'Actif') : t('Inactive', 'معطّل', 'Inactif')}
                    data-testid="staff-status" />
                </div>
              </div>
            </div>
            {canManage && m.userId !== currentUserId && (
              <button type="button" data-testid="staff-toggle" disabled={pending && busyId === m.userId}
                onClick={() => toggle(m)}
                className={cn('inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50',
                  m.isActive ? 'border-red-200 text-red-700 hover:bg-danger-500/10' : 'border-green-200 text-green-700 hover:bg-success-500/10')}>
                {m.isActive ? <><UserX className="h-3.5 w-3.5" /> {t('Deactivate', 'تعطيل', 'Désactiver')}</>
                  : <><UserCheck className="h-3.5 w-3.5" /> {t('Reactivate', 'إعادة تفعيل', 'Réactiver')}</>}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
