'use client'

/**
 * Membership-plans CRUD (UX-2). The plans tab was read-only display — gyms
 * could not create or retire plans anywhere in admin, even though plans are
 * the SSOT for ML-1's renewal/plan-change pickers and the add-student wizard.
 * Add/edit run through the shared FormWizard (names → pricing/duration →
 * review); archive pattern (is_active=false), never hard-delete. Writes via
 * the staff-scoped membership_plans RLS (verified gym-scoped, 000049 header).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { FormWizard } from '@/components/shared/form-wizard'
import { Plus, Pencil, Archive, ArchiveRestore } from 'lucide-react'

export type PlanRow = {
  id?: string
  name_ar?: string
  name_en?: string
  name_fr?: string
  duration_days?: number
  price_usd?: number
  price_lbp?: number
  is_active?: boolean
}

const DURATION_PRESETS = [30, 90, 180, 365]

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was remounting its subtree each render.
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function PlanManager({ plans, gymId, locale }: { plans: PlanRow[]; gymId: string; locale: string }) {
  const t = useTranslations('settings.planManager')
  const router = useRouter()
  const isRTL = locale === 'ar'

  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<PlanRow | null>(null) // {} = add mode
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [nameFr, setNameFr] = useState('')
  const [priceUsd, setPriceUsd] = useState('')
  const [priceLbp, setPriceLbp] = useState('')
  const [duration, setDuration] = useState(30)

  const lname = (p: PlanRow) => ((isRTL ? p.name_ar : locale === 'fr' ? p.name_fr : p.name_en) || p.name_en || '')

  const openWizard = (p: PlanRow | null) => {
    setNameEn(p?.name_en ?? '')
    setNameAr(p?.name_ar ?? '')
    setNameFr(p?.name_fr ?? '')
    setPriceUsd(p?.price_usd != null ? String(p.price_usd) : '')
    setPriceLbp(p?.price_lbp != null ? String(p.price_lbp) : '')
    setDuration(p?.duration_days ?? 30)
    setEditing(p ?? {})
  }

  const submit = async () => {
    setBusy(true)
    const supabase = createClient()
    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || nameEn.trim(),
      name_fr: nameFr.trim() || nameEn.trim(),
      price_usd: Number(priceUsd),
      price_lbp: priceLbp.trim() ? Number(priceLbp) : null,
      duration_days: duration,
    }
    const { error } = editing?.id
      ? await supabase.from('membership_plans').update(payload).eq('id', editing.id)
      : await supabase.from('membership_plans').insert({ gym_id: gymId, is_active: true, ...payload })
    setBusy(false)
    if (!error) { setEditing(null); router.refresh() }
  }

  const setActive = async (id: string, active: boolean) => {
    setBusy(true)
    const supabase = createClient()
    await supabase.from('membership_plans').update({ is_active: active }).eq('id', id)
    setBusy(false)
    router.refresh()
  }

  const steps = [
    {
      key: 'names',
      title: t('stepNames'),
      valid: nameEn.trim() !== '',
      content: (
        <div className="space-y-3">
          <F label={`${t('nameEn')} *`}><Input data-testid="plan-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></F>
          <F label={t('nameAr')}><Input dir="rtl" data-testid="plan-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></F>
          <F label={t('nameFr')}><Input data-testid="plan-name-fr" value={nameFr} onChange={(e) => setNameFr(e.target.value)} /></F>
        </div>
      ),
    },
    {
      key: 'pricing',
      title: t('stepPricing'),
      valid: priceUsd.trim() !== '' && !Number.isNaN(Number(priceUsd)) && duration > 0,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label={`${t('priceUsd')} *`}><Input dir="ltr" type="number" data-testid="plan-price-usd" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} /></F>
            <F label={t('priceLbp')}><Input dir="ltr" type="number" data-testid="plan-price-lbp" value={priceLbp} onChange={(e) => setPriceLbp(e.target.value)} /></F>
          </div>
          <F label={`${t('duration')} *`}>
            <div className="flex flex-wrap items-center gap-1.5">
              {DURATION_PRESETS.map((d) => (
                <button key={d} type="button" data-testid="plan-duration-chip" data-value={d}
                  onClick={() => setDuration(d)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                    duration === d ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700')}>
                  {t(`preset${d}` as Parameters<typeof t>[0])}
                </button>
              ))}
              <Input dir="ltr" type="number" data-testid="plan-duration-custom" value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 0)} className="h-8 w-20" />
            </div>
          </F>
        </div>
      ),
    },
    {
      key: 'review',
      title: t('stepReview'),
      content: (
        <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700" data-testid="plan-review">
          <p className="font-semibold text-gray-900">{nameEn}</p>
          <p>${Number(priceUsd || 0).toLocaleString()}{priceLbp ? ` · ${Number(priceLbp).toLocaleString()} L.L.` : ''}</p>
          <p>{t('reviewDuration', { days: duration })}</p>
        </div>
      ),
    },
  ]

  return (
    <div className={cn('mb-5 space-y-3 rounded-2xl border bg-white p-4 shadow-sm', isRTL && 'rtl text-right')} data-testid="plan-manager">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
        <Button size="sm" data-testid="plan-add-btn" disabled={busy} onClick={() => openWizard(null)} className="bg-primary-700 hover:bg-primary-800">
          <Plus className="me-1 h-4 w-4" /> {t('add')}
        </Button>
      </div>

      <ul className="divide-y">
        {plans.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 py-2" data-testid="plan-row" data-name-en={p.name_en} data-active={p.is_active !== false}>
            <span className={cn('flex items-center gap-1.5 text-sm font-medium', p.is_active === false ? 'text-gray-400' : 'text-gray-800')}>
              {lname(p)} <span className="text-xs font-normal text-gray-400">· ${p.price_usd?.toLocaleString()} · {p.duration_days}d</span>
              {p.is_active === false && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-2xs font-medium text-gray-500">{t('archived')}</span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" data-testid="plan-edit-btn" disabled={busy} onClick={() => openWizard(p)}>
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </Button>
              {p.is_active !== false ? (
                <Button size="sm" variant="ghost" data-testid="plan-archive-btn" disabled={busy}
                  className="text-red-500 hover:bg-red-50" onClick={() => setActive(p.id!, false)}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" variant="ghost" data-testid="plan-restore-btn" disabled={busy}
                  className="text-green-600 hover:bg-green-50" onClick={() => setActive(p.id!, true)}>
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </Button>
              )}
            </span>
          </li>
        ))}
        {plans.length === 0 && <li className="py-2 text-xs text-gray-400">{t('empty')}</li>}
      </ul>

      {editing !== null && (
        <FormWizard
          open
          onClose={() => setEditing(null)}
          title={editing.id ? t('editTitle') : t('addTitle')}
          steps={steps}
          onSubmit={submit}
          submitLabel={t('save')}
          busy={busy}
          locale={locale}
          testid="plan-wizard"
        />
      )}
    </div>
  )
}
