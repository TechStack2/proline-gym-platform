'use client'

/**
 * Camps board (E1): camp cards (dates · ages · price · N/capacity · status) +
 * the UX-1 wizard (create/edit — steps, no dropdowns) + the ADM-1 publish
 * toggle + archive (status→cancelled, never delete) with a confirmed-
 * registrations warning. Writes go through the gym-scoped staff RLS.
 */
import { fmtDate } from '@/lib/fmt'
import { fmtLbp } from '@/lib/billing/currency'
import { useState } from 'react'
import Link from 'next/link'
import { FormWizard, type WizardStep } from '@/components/shared/form-wizard'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { statusTintClass } from '@/lib/status-vocabulary'
import { toast } from '@/components/ui/use-toast'
import { Tent, Plus, Globe, Pencil, Archive, Users } from 'lucide-react'
import { NavChevron } from '@/components/ui/nav-chevron'

export type CampRow = {
  id: string
  name_ar: string; name_en: string; name_fr: string
  start_date: string; end_date: string
  min_age: number | null; max_age: number | null
  max_capacity: number
  price_usd: number; price_lbp: number | null
  status: string
  show_on_landing: boolean
}

// W3b §2.3/DA-25: camp statuses have no entry in the status vocabulary (a camp
// domain is a vocabulary change, out of this display-only pass), so the local
// map stays — but its fills wear the dark-correct role TINTS, not -100/-50 pins.
// W3b: colour is the status vocabulary's call (`camp` domain) — no local map.

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was defined during render.
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function CampsBoard({ camps, confirmed, pending, gymId, locale }: {
  camps: CampRow[]
  confirmed: Record<string, number>
  pending: Record<string, number>
  gymId: string
  locale: string
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('camps')
  const tc = useTranslations('common')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<CampRow | null>(null)
  const [f, setF] = useState({
    en: '', ar: '', fr: '', start: '', end: '', minAge: '6', maxAge: '16',
    capacity: '20', priceUsd: '', priceLbp: '',
  })

  const lname = (c: CampRow) => ((isRTL ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en)
  const fmtD = (d: string) => fmtDate(d, locale, 'dayMonth')

  const openCreate = () => {
    setEditing(null)
    setF({ en: '', ar: '', fr: '', start: '', end: '', minAge: '6', maxAge: '16', capacity: '20', priceUsd: '', priceLbp: '' })
    setWizardOpen(true)
  }
  const openEdit = (c: CampRow) => {
    setEditing(c)
    setF({
      en: c.name_en, ar: c.name_ar, fr: c.name_fr, start: c.start_date, end: c.end_date,
      minAge: String(c.min_age ?? ''), maxAge: String(c.max_age ?? ''),
      capacity: String(c.max_capacity), priceUsd: String(c.price_usd), priceLbp: String(c.price_lbp ?? ''),
    })
    setWizardOpen(true)
  }

  const save = async () => {
    setBusy(true)
    const supabase = createClient()
    const payload = {
      name_en: f.en.trim(), name_ar: f.ar.trim() || f.en.trim(), name_fr: f.fr.trim() || f.en.trim(),
      start_date: f.start, end_date: f.end,
      min_age: f.minAge ? Number(f.minAge) : null, max_age: f.maxAge ? Number(f.maxAge) : null,
      max_capacity: Number(f.capacity), price_usd: Number(f.priceUsd),
      price_lbp: f.priceLbp ? Number(f.priceLbp) : null,
    }
    const res = editing
      ? await supabase.from('camps').update(payload).eq('id', editing.id)
      : await supabase.from('camps').insert({ ...payload, gym_id: gymId, status: 'open', show_on_landing: false })
    setBusy(false)
    if (res.error) { console.error('[camps-board]', res.error); toast({ title: t('saveFailed'), variant: 'destructive' }); return } // ERROR-HARDEN
    toast({ title: t(editing ? 'updated' : 'created'), variant: 'success' })
    setWizardOpen(false)
    router.refresh()
  }

  const togglePublish = async (c: CampRow) => {
    setBusy(true)
    const { error } = await createClient().from('camps').update({ show_on_landing: !c.show_on_landing }).eq('id', c.id)
    setBusy(false)
    if (error) { console.error('[camps-board]', error); toast({ title: t('saveFailed'), variant: 'destructive' }) } // ERROR-HARDEN
    else router.refresh()
  }

  const archive = async (c: CampRow) => {
    const n = confirmed[c.id] ?? 0
    const msg = n > 0 ? t('archiveWarnRegs', { count: n }) : t('archiveWarn')
    if (!window.confirm(msg)) return
    setBusy(true)
    const { error } = await createClient().from('camps')
      .update({ status: 'cancelled', show_on_landing: false }).eq('id', c.id)
    setBusy(false)
    if (error) { console.error('[camps-board]', error); toast({ title: t('saveFailed'), variant: 'destructive' }) } // ERROR-HARDEN
    else router.refresh()
  }

  // M2-B: the create/edit form now rides the shared FormWizard (was a hand-rolled modal).
  // Steps ~ Basics (trilingual name, en required + ar/fr en-fallback) → Dates & capacity
  // → Pricing → Review. No discipline chip: the camps table has no discipline_id column
  // and this slice is app-only. Field testids are preserved; the wizard nav is the shared
  // wizard-next/wizard-submit set (e1 updated same-slice). Submit reuses save() verbatim.
  const campSteps: WizardStep[] = [
    {
      key: 'basics', title: t('stepBasics'), valid: f.en.trim() !== '',
      content: (
        <div className="space-y-3">
          <F label={t('nameEn')}><Input data-testid="camp-name-en" value={f.en} onChange={(e) => setF((p) => ({ ...p, en: e.target.value }))} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label={t('nameAr')}><Input dir="rtl" data-testid="camp-name-ar" value={f.ar} onChange={(e) => setF((p) => ({ ...p, ar: e.target.value }))} /></F>
            <F label={t('nameFr')}><Input data-testid="camp-name-fr" value={f.fr} onChange={(e) => setF((p) => ({ ...p, fr: e.target.value }))} /></F>
          </div>
        </div>
      ),
    },
    {
      key: 'dates', title: t('stepDates'),
      valid: f.start !== '' && f.end !== '' && f.start <= f.end && Number(f.capacity) > 0,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label={t('startDate')}><Input type="date" data-testid="camp-start" value={f.start} onChange={(e) => setF((p) => ({ ...p, start: e.target.value }))} /></F>
            <F label={t('endDate')}><Input type="date" data-testid="camp-end" value={f.end} onChange={(e) => setF((p) => ({ ...p, end: e.target.value }))} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label={t('minAge')}><Input type="number" min="3" data-testid="camp-min-age" value={f.minAge} onChange={(e) => setF((p) => ({ ...p, minAge: e.target.value }))} /></F>
            <F label={t('maxAge')}><Input type="number" min="3" data-testid="camp-max-age" value={f.maxAge} onChange={(e) => setF((p) => ({ ...p, maxAge: e.target.value }))} /></F>
          </div>
          <F label={t('capacity')}><Input type="number" min="1" data-testid="camp-capacity" value={f.capacity} onChange={(e) => setF((p) => ({ ...p, capacity: e.target.value }))} /></F>
        </div>
      ),
    },
    {
      key: 'pricing', title: t('stepPricing'), valid: f.priceUsd !== '' && Number(f.priceUsd) >= 0,
      content: (
        <div className="grid grid-cols-2 gap-3">
          <F label={t('priceUsd')}><div className="flex items-center gap-1"><Input type="number" min="0" step="0.01" data-testid="camp-price-usd" className="flex-1" value={f.priceUsd} onChange={(e) => setF((p) => ({ ...p, priceUsd: e.target.value }))} /><button type="button" data-testid="camp-free" onClick={() => setF((p) => ({ ...p, priceUsd: '0' }))} className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium', f.priceUsd.trim() !== '' && Number(f.priceUsd) === 0 ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}>{tc('free')}</button></div></F>
          <F label={t('priceLbp')}><Input type="number" min="0" data-testid="camp-price-lbp" value={f.priceLbp} onChange={(e) => setF((p) => ({ ...p, priceLbp: e.target.value }))} placeholder={t('optional')} /></F>
        </div>
      ),
    },
    {
      key: 'review', title: t('stepReview'),
      content: (
        <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700" data-testid="camp-review">
          <p className="font-semibold text-gray-900">{f.en}</p>
          <p dir="ltr">{f.start} → {f.end}</p>
          <p>{t('ages', { min: f.minAge || '—', max: f.maxAge || '—' })} · {t('capacity')}: {f.capacity}</p>
          <p>${f.priceUsd}{f.priceLbp ? ` · ${fmtLbp(Number(f.priceLbp))}` : ''}</p>
          {!editing && <p className="text-xs text-gray-400">{t('stagedNote')}</p>}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Button data-testid="camp-add-btn" onClick={openCreate} className="bg-primary-700 hover:bg-primary-800">
        <Plus className="me-1 h-4 w-4" /> {t('addCamp')}
      </Button>

      {camps.length === 0 ? (
        <p className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-400 shadow-sm">{t('none')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {camps.map((c) => (
            <div key={c.id} data-testid="camp-card" data-name-en={c.name_en} data-status={c.status}
              className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/${locale}/camps/${c.id}`} className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-700/10">
                    <Tent className="h-4 w-4 text-primary-700" />
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block truncate text-sm font-semibold text-gray-900 hover:underline', isRTL && 'font-arabic')}>{lname(c)}</span>
                    <span className="block text-xs text-gray-500" dir="ltr">{fmtD(c.start_date)} – {fmtD(c.end_date)}</span>
                  </span>
                </Link>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', statusTintClass('camp', c.status))}>
                  {t(`status.${c.status}` as any)}
                </span>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                <span className="inline-flex items-center gap-1 font-medium" data-testid="camp-count">
                  <Users className="h-3 w-3" /> {confirmed[c.id] ?? 0}/{c.max_capacity}
                </span>
                {(pending[c.id] ?? 0) > 0 && <span className="text-amber-600">{t('pendingCount', { count: pending[c.id] })}</span>}
                <span>${Number(c.price_usd).toFixed(0)}</span>
                {c.min_age != null && c.max_age != null && <span>{t('ages', { min: c.min_age, max: c.max_age })}</span>}
              </p>
              <div className="mt-3 flex items-center gap-1.5 border-t pt-2.5">
                <button type="button" data-testid="camp-publish-toggle" data-on={c.show_on_landing} disabled={busy}
                  onClick={() => togglePublish(c)}
                  className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium',
                    c.show_on_landing ? 'tint-success border-success-500/40' : 'border-gray-200 text-gray-400')}>
                  <Globe className="h-3 w-3" /> {c.show_on_landing ? t('onLanding') : t('staged')}
                </button>
                <Button size="sm" variant="ghost" data-testid="camp-edit-btn" disabled={busy} onClick={() => openEdit(c)}>
                  <Pencil className="h-3.5 w-3.5 text-gray-400" />
                </Button>
                {c.status !== 'cancelled' && (
                  <Button size="sm" variant="ghost" data-testid="camp-archive-btn" disabled={busy}
                    className="text-red-500 hover:bg-danger-500/10" onClick={() => archive(c)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Link href={`/${locale}/camps/${c.id}`} data-testid="camp-roster-link"
                  className="ms-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary-600 hover:underline">
                  {t('roster')} <NavChevron className="h-3 w-3 text-primary-600" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={editing ? t('editCamp') : t('addCamp')}
        steps={campSteps}
        onSubmit={save}
        submitLabel={editing ? t('saveChanges') : t('createCamp')}
        busy={busy}
        locale={locale}
        testid="camp-wizard"
      />
    </div>
  )
}
