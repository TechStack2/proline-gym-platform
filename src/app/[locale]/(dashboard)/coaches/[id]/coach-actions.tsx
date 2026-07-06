'use client'

/**
 * Coach 360 quick-actions bar (TEAM-1). Mirrors the Member-360 actions area:
 * everything delegates to an EXISTING verified flow — no new writers.
 *   · Assign to class → the class wizard (coach assignment lives there).
 *   · Book PT        → the shared DiaryBookPt picker → BookPtModal (PT-2).
 *   · Edit / Invite  → the ADM-1/ON-1 flows (unchanged).
 *   · Deactivate     → setCoachActive, gated to owner/head_coach (the one
 *                      guardrail); reception never sees the control.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Pencil, UserX, UserCheck, Loader2, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InviteButton } from '@/components/shared/invite-button'
import { DiaryBookPt, type DiaryAssignment } from '../../schedule/diary-book-pt'
import { setCoachActive } from './actions'
import { toast } from 'sonner'

export function CoachActions({
  coachId, coachName, locale, isActive, canDeactivate,
  activeClassCount, activePtCount, assignments, phone,
}: {
  coachId: string
  coachName: string
  locale: string
  isActive: boolean
  /** owner / head_coach only — the deactivate guardrail. */
  canDeactivate: boolean
  activeClassCount: number
  activePtCount: number
  assignments: DiaryAssignment[]
  /** STAFF-INVITE: the coach's phone — empty → the inline "add a phone" prompt. */
  phone: string | null
}) {
  const t = useTranslations('coach360')
  const ta = useTranslations('coaches.admin')
  const router = useRouter()
  const [confirmDeact, setConfirmDeact] = useState(false)
  const [busy, setBusy] = useState(false)

  const hasObligations = activeClassCount > 0 || activePtCount > 0

  const deactivate = async () => {
    setBusy(true)
    const res = await setCoachActive({ coachId, active: false })
    setBusy(false)
    if (res.ok) { router.push(`/${locale}/coaches`); router.refresh() }
    else toast.error(res.error)
  }

  const reactivate = async () => {
    setBusy(true)
    const res = await setCoachActive({ coachId, active: true })
    setBusy(false)
    if (res.ok) router.refresh()
    else toast.error(res.error)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm" data-testid="coach-admin-bar">
      <Link href={`/${locale}/coaches/${coachId}/edit`}>
        <Button variant="outline" size="sm" data-testid="coach-edit-btn">
          <Pencil className="me-1 h-4 w-4" /> {ta('edit')}
        </Button>
      </Link>

      {/* Assign to a class — the wizard owns coach↔class assignment (no new writer). */}
      <Link href={`/${locale}/classes`}>
        <Button variant="outline" size="sm" data-testid="coach-assign-class">
          <CalendarPlus className="me-1 h-4 w-4" /> {t('actions.assignClass')}
        </Button>
      </Link>

      {/* Book a PT session for one of this coach's clients (PT-2 shared picker). */}
      {assignments.length > 0 && (
        <div data-testid="coach360-book-pt">
          <DiaryBookPt assignments={assignments} locale={locale} />
        </div>
      )}

      {/* ON-1: invite this coach to the app (team invite — elevated scope).
          STAFF-INVITE: no phone → the inline add-a-phone prompt (no dead-end click). */}
      <InviteButton kind="coach" id={coachId} name={coachName} locale={locale}
        phone={phone} editHref={`/${locale}/coaches/${coachId}/edit`} />

      {/* DEACTIVATE — owner/head_coach only; reception gets no control. */}
      {canDeactivate && (
        isActive ? (
          confirmDeact ? (
            <span className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="coach-deactivate-warning">
              {hasObligations
                ? ta('deactivateWarn', { classes: activeClassCount, pt: activePtCount })
                : ta('deactivateConfirm')}
              <Button size="sm" variant="outline" data-testid="coach-deactivate-confirm" disabled={busy}
                className="border-red-300 text-red-700 hover:bg-red-100" onClick={deactivate}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ta('deactivateYes')}
              </Button>
              <Button size="sm" variant="ghost" data-testid="coach-deactivate-cancel" onClick={() => setConfirmDeact(false)}>
                {ta('cancel')}
              </Button>
            </span>
          ) : (
            <Button variant="outline" size="sm" data-testid="coach-deactivate-btn"
              className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDeact(true)}>
              <UserX className="me-1 h-4 w-4" /> {ta('deactivate')}
            </Button>
          )
        ) : (
          <Button variant="outline" size="sm" data-testid="coach-reactivate-btn" disabled={busy}
            className="text-green-700 hover:bg-green-50" onClick={reactivate}>
            {busy ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <UserCheck className="me-1 h-4 w-4" />} {t('actions.reactivate')}
          </Button>
        )
      )}
    </div>
  )
}
