'use client'

/**
 * Add-Class WIZARD (UX-1) — the touch-first class create/edit.
 *
 * Steps (no dropdowns anywhere — chips, pills, native inputs only):
 *   1 Basics: names ar/en/fr + discipline CHIPS + coach CHIPS
 *   2 Weekly schedule: day PILLS (multi-select) + a shared start/end with tappable
 *     presets + optional per-day override
 *   3 Capacity stepper + monthly fee (B2) + status pills + landing toggle
 *   4 Review → Create via the SAME insert path (classes + class_schedules).
 *
 * M2-D WIZARD-POLISH: the bespoke step machine + modal chrome are replaced by the
 * shared FormWizard (testid="class-wizard"). Nav is now wizard-next/wizard-submit/
 * wizard-back (was class-submit for commit → helpers/adm1 updated same-slice). The
 * post-create success panel (wizard-success) is FormWizard has none, so it's kept here
 * as a conditional render. Every field testid + the write path are unchanged.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ModalPortal } from '@/components/shared/modal-portal'
import { useTranslations } from 'next-intl'
import { useCaughtErrorText } from '@/lib/errors/use-error-text';
import { useRouter } from 'next/navigation'
import { Minus, Plus, Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormWizard, type WizardStep } from '@/components/shared/form-wizard'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { Avatar } from '@/components/shared/avatar'
import { DisciplineIcon } from '@/components/dashboard/discipline-icon'

export type EditClass = {
  id: string
  name_en: string
  name_ar: string | null
  name_fr: string | null
  discipline_id: string
  coach_id: string
  max_capacity: number
  monthly_fee_usd: number | null
  status: string
  show_on_landing?: boolean
  schedules: { day_of_week: number; start_time: string; end_time: string }[]
}

interface AddClassModalProps {
  disciplines: any[]
  coaches: any[]
  locale: string
  onClose: () => void
  onSuccess: () => void
  /** ADM-1: when set, the wizard edits this class (update + replace schedules). */
  editClass?: EditClass
}

type Status = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
const STATUSES: Status[] = ['scheduled', 'in_progress', 'completed', 'cancelled']
const DOWS = [1, 2, 3, 4, 5, 6, 0] as const // Mon-first
const TIME_PRESETS = ['17:00', '18:00', '19:00', '20:00'] as const

type DayTime = { start: string; end: string }

function plusOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function AddClassModal({ disciplines, coaches, locale, onClose, onSuccess, editClass }: AddClassModalProps) {
  const t = useTranslations('classes.wizard')
  const errCaught = useCaughtErrorText();
  const router = useRouter()
  const isRTL = locale === 'ar'

  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState('')

  const hhmm5 = (v: string) => (v || '').slice(0, 5)
  const editSlots = editClass?.schedules ?? []
  const editShared: DayTime = editSlots.length
    ? { start: hhmm5(editSlots[0].start_time), end: hhmm5(editSlots[0].end_time) }
    : { start: '18:00', end: '19:00' }
  const editOverrides: Record<number, DayTime> = {}
  for (const sl of editSlots) {
    const dt = { start: hhmm5(sl.start_time), end: hhmm5(sl.end_time) }
    if (dt.start !== editShared.start || dt.end !== editShared.end) editOverrides[sl.day_of_week] = dt
  }

  // Step 1 (prefilled in edit mode)
  const [nameEn, setNameEn] = useState(editClass?.name_en ?? '')
  const [nameAr, setNameAr] = useState(editClass?.name_ar ?? '')
  const [nameFr, setNameFr] = useState(editClass?.name_fr ?? '')
  const [disciplineId, setDisciplineId] = useState(editClass?.discipline_id ?? '')
  const [coachId, setCoachId] = useState(editClass?.coach_id ?? '')
  // Step 2 — Monday preselected with a sane evening default.
  const [days, setDays] = useState<number[]>(editClass ? [...new Set(editSlots.map((x) => x.day_of_week))] : [1])
  const [shared, setShared] = useState<DayTime>(editShared)
  const [overrides, setOverrides] = useState<Record<number, DayTime>>(editOverrides)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  // Step 3
  const [capacity, setCapacity] = useState(editClass?.max_capacity ?? 20)
  const [fee, setFee] = useState(editClass?.monthly_fee_usd != null ? String(editClass.monthly_fee_usd) : '')
  const [status, setStatus] = useState<Status>((editClass?.status as Status) ?? 'scheduled')
  const [showOnLanding, setShowOnLanding] = useState<boolean>(editClass?.show_on_landing ?? false)

  const dayLabel = (d: number) => t(`days.${d}` as any)
  const timeFor = (d: number): DayTime => overrides[d] ?? shared

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[d]
      return next
    })
    if (editingDay === d) setEditingDay(null)
  }

  const applyPreset = (start: string) => {
    setShared({ start, end: plusOneHour(start) })
    setOverrides({}) // a preset re-applies one time to every selected day
    setEditingDay(null)
  }

  // Per-step validity — FormWizard disables Next until true (was a next()-time error).
  const validateStep = (s: number): boolean => {
    if (s === 1) return !!(nameEn.trim() && disciplineId && coachId)
    if (s === 2) {
      if (days.length === 0) return false
      return days.every((d) => { const dt = timeFor(d); return !!(dt.start && dt.end && dt.start < dt.end) })
    }
    if (s === 3) return !!(capacity && capacity >= 1)
    return true
  }

  // The EXISTING insert path (B2/AR-corrected): classes + class_schedules, staff gym_id
  // resolution. Presentation changed; the write did not.
  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: prof } = await supabase.from('profiles').select('gym_id').eq('id', user?.id ?? '').single()
      if (!prof?.gym_id) throw new Error(t('errNoGym'))

      const payload = {
        name_en: nameEn.trim(),
        name_ar: nameAr.trim() || nameEn.trim(),
        name_fr: nameFr.trim() || nameEn.trim(),
        discipline_id: disciplineId,
        coach_id: coachId,
        max_capacity: capacity,
        monthly_fee_usd: fee ? parseFloat(fee) : null,
        status,
        show_on_landing: showOnLanding,
      }

      let classId: string
      if (editClass) {
        const { error: updError } = await supabase.from('classes').update(payload).eq('id', editClass.id)
        if (updError) throw updError
        classId = editClass.id
        // Replace the weekly template for this class.
        const { error: delError } = await supabase.from('class_schedules').delete().eq('class_id', classId)
        if (delError) throw delError
      } else {
        const { data: classData, error: classError } = await supabase
          .from('classes')
          .insert({ gym_id: prof.gym_id, ...payload })
          .select()
          .single()
        if (classError) throw classError
        classId = classData.id
      }

      const { error: scheduleError } = await supabase.from('class_schedules').insert(
        days.map((d) => ({
          class_id: classId,
          day_of_week: d,
          start_time: timeFor(d).start,
          end_time: timeFor(d).end,
        })),
      )
      if (scheduleError) throw scheduleError

      setCreated(true)
      router.refresh()
      setTimeout(() => onSuccess(), 900)
    } catch (err: any) {
      setError(errCaught(err))
      setCreating(false)
    }
  }

  const disciplineName = (id: string) => {
    const d = disciplines.find((x) => x.id === id)
    return d ? (d[`name_${locale}`] || d.name_en) : ''
  }
  const coachLabel = (id: string) => {
    const c = coaches.find((x) => x.id === id)
    return c ? localizedName(c.profiles, locale) : ''
  }

  const steps: WizardStep[] = [
    {
      key: 'basics', title: t('stepBasics'), valid: validateStep(1),
      content: (
        <div className="space-y-5">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('nameEn')} *</label>
              <Input data-testid="class-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('nameAr')}</label>
                <Input data-testid="class-name-ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('nameFr')}</label>
                <Input data-testid="class-name-fr" value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t('discipline')} *</p>
            <div className="flex flex-wrap gap-2">
              {disciplines.map((d) => (
                <button key={d.id} type="button" data-testid="wizard-discipline-chip" data-id={d.id}
                  onClick={() => setDisciplineId(d.id)}
                  className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    disciplineId === d.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                  <DisciplineIcon iconUrl={d.icon_url} name={d[`name_${locale}`] || d.name_en} size="xs" />
                  {d[`name_${locale}`] || d.name_en}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t('coach')} *</p>
            {coaches.length === 0 ? (
              // J4 CLASS-SURFACE: a class REQUIRES a coach — a fresh gym has none, so guide
              // the owner to add one first instead of a blank required field.
              <div data-testid="wizard-no-coaches" className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className={cn('text-sm text-amber-800', isRTL && 'font-arabic text-right')}>{t('noCoachesHint')}</p>
                <Link href={`/${locale}/coaches/add`} data-testid="wizard-add-coach-cta"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-800">
                  <Plus className="h-4 w-4" /> {t('addCoachCta')}
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {coaches.map((c) => {
                  const name = localizedName(c.profiles, locale)
                  return (
                    <button key={c.id} type="button" data-testid="wizard-coach-chip" data-id={c.id}
                      onClick={() => setCoachId(c.id)}
                      className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                        coachId === c.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                      <Avatar url={one(c.profiles)?.avatar_url} name={name} size="sm" />
                      {name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'schedule', title: t('stepSchedule'), valid: validateStep(2),
      content: (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium">{t('pickDays')} *</p>
            <div className="flex flex-wrap gap-2">
              {DOWS.map((d) => (
                <button key={d} type="button" data-testid="wizard-day-pill" data-dow={d}
                  onClick={() => toggleDay(d)}
                  className={cn('min-w-[3.25rem] rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                    days.includes(d) ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                  {dayLabel(d)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t('sharedTime')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="time" data-testid="wizard-start-time" value={shared.start}
                onChange={(e) => setShared((p) => ({ ...p, start: e.target.value }))} className="w-32" />
              <span className="text-gray-400">–</span>
              <Input type="time" data-testid="wizard-end-time" value={shared.end}
                onChange={(e) => setShared((p) => ({ ...p, end: e.target.value }))} className="w-32" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIME_PRESETS.map((p) => (
                <button key={p} type="button" data-testid="wizard-preset" data-time={p}
                  onClick={() => applyPreset(p)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', shared.start === p && Object.keys(overrides).length === 0
                    ? 'border-primary-700 bg-red-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
                  dir="ltr">
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">{t('presetHint')}</p>
          </div>

          {days.length > 0 && (
            <div className="space-y-1.5">
              {[...days].sort((a, b) => DOWS.indexOf(a as any) - DOWS.indexOf(b as any)).map((d) => {
                const dt = timeFor(d)
                const isEditing = editingDay === d
                return (
                  <div key={d} className="rounded-xl border bg-gray-50 px-3 py-2" data-testid="wizard-day-row" data-dow={d}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">{dayLabel(d)}</span>
                      <span className="text-xs text-gray-500" dir="ltr">{dt.start}–{dt.end}</span>
                      <button type="button" data-testid="wizard-day-override" onClick={() => setEditingDay(isEditing ? null : d)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                        <Pencil className="h-3 w-3" /> {t('customize')}
                      </button>
                    </div>
                    {isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <Input type="time" value={dt.start} className="w-28 bg-white"
                          onChange={(e) => setOverrides((p) => ({ ...p, [d]: { ...timeFor(d), start: e.target.value } }))} />
                        <span className="text-gray-400">–</span>
                        <Input type="time" value={dt.end} className="w-28 bg-white"
                          onChange={(e) => setOverrides((p) => ({ ...p, [d]: { ...timeFor(d), end: e.target.value } }))} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'pricing', title: t('stepPricing'), valid: validateStep(3),
      content: (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium">{t('capacity')} *</p>
            <div className="inline-flex items-center gap-1 rounded-xl border p-1">
              <button type="button" data-testid="wizard-cap-minus" onClick={() => setCapacity((c) => Math.max(1, c - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="-">
                <Minus className="h-4 w-4" />
              </button>
              <Input type="number" min={1} max={500} data-testid="class-capacity" value={capacity}
                onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-10 w-20 border-0 text-center text-base font-semibold shadow-none focus-visible:ring-0" />
              <button type="button" data-testid="wizard-cap-plus" onClick={() => setCapacity((c) => Math.min(500, c + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="+">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t('monthlyFee')}</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">$</span>
              <Input type="number" min="0" step="0.01" data-testid="class-monthly-fee" placeholder="0.00"
                value={fee} onChange={(e) => setFee(e.target.value)} className="w-36" dir="ltr" />
              <span className="text-xs text-gray-400">/{t('mo')}</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">{t('feeHint')}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t('status')}</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s} type="button" data-testid="wizard-status-pill" data-value={s}
                  onClick={() => setStatus(s)}
                  className={cn('rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    status === s ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                  {t(`statusValues.${s}` as any)}
                </button>
              ))}
            </div>
          </div>

          {/* ADM-1: landing publish switch — staged (default) until staff flip it */}
          <button type="button" data-testid="wizard-landing-toggle" data-on={showOnLanding}
            onClick={() => setShowOnLanding((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-start">
            <span>
              <span className="block text-sm font-medium text-gray-900">{t('showOnLanding')}</span>
              <span className="block text-xs text-gray-400">{t('showOnLandingHint')}</span>
            </span>
            <span className={cn('relative h-6 w-11 rounded-full transition-colors', showOnLanding ? 'bg-primary-700' : 'bg-gray-200')}>
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', showOnLanding ? (isRTL ? 'right-5' : 'left-5') : (isRTL ? 'right-0.5' : 'left-0.5'))} />
            </span>
          </button>
        </div>
      ),
    },
    {
      key: 'review', title: t('stepReview'),
      content: (
        <div className="space-y-3" data-testid="wizard-review">
          {error && (
            <div data-testid="wizard-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="rounded-2xl border bg-gray-50 p-4">
            <p className={cn('text-base font-bold text-gray-900', isRTL && 'font-arabic')}>{nameEn}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">{t('discipline')}</dt><dd className="font-medium">{disciplineName(disciplineId)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">{t('coach')}</dt><dd className="font-medium">{coachLabel(coachId)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">{t('pickDays')}</dt>
                <dd className="font-medium" dir="ltr">
                  {[...days].sort((a, b) => DOWS.indexOf(a as any) - DOWS.indexOf(b as any)).map((d) => `${dayLabel(d)} ${timeFor(d).start}`).join(' · ')}
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-gray-500">{t('capacity')}</dt><dd className="font-medium">{capacity}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">{t('monthlyFee')}</dt><dd className="font-medium">{fee ? `$${fee}` : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">{t('status')}</dt><dd className="font-medium">{t(`statusValues.${status}` as any)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">{t('showOnLanding')}</dt><dd className="font-medium">{showOnLanding ? t('published') : t('staged')}</dd></div>
            </dl>
          </div>
        </div>
      ),
    },
  ]

  // Post-create success (FormWizard has no success state) — its own modal, preserving
  // the class-wizard + wizard-success testids + the 900ms auto-close (via create()).
  if (created) {
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div data-testid="class-wizard" className={cn('flex w-full flex-col bg-white p-6 sm:max-w-xl sm:rounded-2xl sm:shadow-xl', isRTL && 'rtl text-right')}>
            <div className="flex flex-col items-center gap-3 py-8" data-testid="wizard-success">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <Check className="h-7 w-7 text-green-600" />
              </span>
              <p className="text-sm font-semibold text-gray-900">{editClass ? t('successEdit') : t('success')}</p>
            </div>
          </div>
        </div>
      </ModalPortal>
    )
  }

  return (
    <FormWizard
      open
      onClose={onClose}
      title={editClass ? t('titleEdit') : t('title')}
      steps={steps}
      onSubmit={create}
      submitLabel={creating ? t('creating') : editClass ? t('save') : t('create')}
      busy={creating}
      locale={locale}
      testid="class-wizard"
    />
  )
}
