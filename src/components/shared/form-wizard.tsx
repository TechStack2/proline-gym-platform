'use client'

/**
 * FormWizard (UX-2) — THE platform entry-form convention, extracted from the
 * UX-1 class wizard / E1 camp wizard idiom: numbered steps with a progress
 * rail · chips/pills instead of dropdowns · a review step · full-screen sheet
 * on mobile, modal on desktop · RTL-aware. Validation is per-step (the Next
 * button gates); submission is the caller's (same write paths — this is
 * presentation only).
 *
 * Converted onto it in UX-2: add-student (guardian step), add-lead,
 * add/edit-coach, membership-plan editor, belt-ladder steps. Classes / camps
 * / PT-sale already followed the idiom (UX-1/E1/PT-1).
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModalPortal } from './modal-portal'
import { X, Loader2, Check } from 'lucide-react'

export type WizardStep = {
  key: string
  title: string
  /** Step body — controlled inputs owned by the caller. */
  content: React.ReactNode
  /** Gate for Next/Submit; omit for always-valid steps (e.g. review). */
  valid?: boolean
}

export function FormWizard({
  open, onClose, title, steps, onSubmit, submitLabel, busy = false, locale, testid = 'form-wizard',
}: {
  open: boolean
  onClose: () => void
  title: string
  steps: WizardStep[]
  onSubmit: () => void | Promise<void>
  submitLabel: string
  busy?: boolean
  locale: string
  testid?: string
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('wizard')
  const [step, setStep] = useState(0)

  if (!open) return null
  const current = steps[step]
  const last = step === steps.length - 1
  const valid = current?.valid !== false

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}>
      <div
        data-testid={testid}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[94vh] w-full flex-col overflow-hidden bg-white shadow-xl',
          'rounded-t-2xl sm:max-w-lg sm:rounded-2xl', // sheet on mobile, modal on desktop
          isRTL && 'rtl text-right',
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress rail + step label */}
        <div className="px-5 pt-3">
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <span key={s.key} data-testid="wizard-step-dot" data-active={i === step}
                className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-[#cd1419]' : 'bg-gray-200')} />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-gray-500" data-testid="wizard-step-title">
            {t('stepOf', { n: step + 1, total: steps.length })} · {current?.title}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" data-testid={`wizard-step-${current?.key}`}>
          {current?.content}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3">
          <Button variant="outline" size="sm" data-testid="wizard-back"
            disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
            {t('back')}
          </Button>
          {last ? (
            <Button size="sm" data-testid="wizard-submit" disabled={!valid || busy}
              onClick={() => void onSubmit()} className="bg-[#cd1419] hover:bg-[#a81014]">
              {busy ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Check className="me-1 h-4 w-4" />}
              {submitLabel}
            </Button>
          ) : (
            <Button size="sm" data-testid="wizard-next" disabled={!valid || busy}
              onClick={() => setStep((s) => s + 1)} className="bg-[#cd1419] hover:bg-[#a81014]">
              {t('next')}
            </Button>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

/** Chip-row selector — the no-dropdown convention. */
export function ChipRow<T extends string>({ options, value, onChange, testid }: {
  options: { value: T; label: string }[]
  value: T | ''
  onChange: (v: T) => void
  testid: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" data-testid={testid} data-value={o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
            value === o.value ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
