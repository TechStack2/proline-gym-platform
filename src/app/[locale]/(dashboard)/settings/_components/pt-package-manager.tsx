'use client'

/**
 * PT package-type catalog CRUD (PT-1). pt_packages IS the gym-scoped type catalog:
 * names, sessions, price, validity, optional discipline (chips), show_on_landing
 * staging toggle. Archive pattern (is_active=false), never hard-delete. Writes via
 * the staff-scoped RLS.
 *
 * M2-D WIZARD-POLISH: create/edit rides the shared FormWizard (was an inline add-grid
 * + in-row edit) — two chunked steps (Basics → Details). The create insert is verbatim;
 * every ptpkg-* testid is preserved (the add fields now live inside the wizard).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormWizard, type WizardStep } from '@/components/shared/form-wizard'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Archive, ArchiveRestore, Globe } from 'lucide-react'

export type PtTypeRow = {
  id?: string; name_ar?: string; name_en?: string; name_fr?: string
  session_count?: number; price_usd?: number; validity_days?: number | null
  discipline_id?: string | null; is_active?: boolean; show_on_landing?: boolean
}
type Disc = { id: string; name_ar?: string; name_en?: string; name_fr?: string }

const BLANK = { en: '', ar: '', fr: '', sessions: '10', price: '', validity: '60', disciplineId: '' }

// FORM-FOCUS-SWEEP: module-scope labelled field (an in-render component remounts <Input>).
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function PtPackageManager({ types, disciplines, gymId, locale }: {
  types: PtTypeRow[]; disciplines: Disc[]; gymId: string; locale: string
}) {
  const t = useTranslations('settings.ptCatalog')
  const tc = useTranslations('common')
  const router = useRouter()
  const isRTL = locale === 'ar'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<PtTypeRow | null>(null)
  const [f, setF] = useState({ ...BLANK })

  const lname = (d: { name_ar?: string; name_en?: string; name_fr?: string }) =>
    ((isRTL ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en || '')

  const openCreate = () => { setEditing(null); setF({ ...BLANK }); setError(''); setWizardOpen(true) }
  const openEdit = (p: PtTypeRow) => {
    setEditing(p)
    setF({
      en: p.name_en || '', ar: p.name_ar || '', fr: p.name_fr || '',
      sessions: String(p.session_count ?? ''), price: String(p.price_usd ?? ''),
      validity: String(p.validity_days ?? ''), disciplineId: p.discipline_id || '',
    })
    setError(''); setWizardOpen(true)
  }

  const run = async (fn: () => Promise<{ error: any }>) => {
    setBusy(true); setError('')
    const { error: err } = await fn()
    setBusy(false)
    if (err) { console.error('[pt-package-manager]', err); setError(tc('genericError')) } // ERROR-HARDEN: no raw pg errors
    else { setWizardOpen(false); router.refresh() }
  }

  // Create insert is VERBATIM from the inline editor; edit updates the same columns via
  // the same .update() path (now incl. ar/fr/discipline the wizard exposes). Toggle/
  // archive/restore stay row actions.
  const save = () =>
    run(async () => {
      if (!f.en.trim()) return { error: { message: t('errNameRequired') } }
      const sessions = parseInt(f.sessions, 10)
      const price = parseFloat(f.price)
      if (!Number.isFinite(sessions) || sessions <= 0 || !Number.isFinite(price) || price < 0) {
        return { error: { message: t('errNumbers') } }
      }
      const supabase = createClient()
      const names = { name_en: f.en.trim(), name_ar: f.ar.trim() || f.en.trim(), name_fr: f.fr.trim() || f.en.trim() }
      if (editing?.id) {
        return supabase.from('pt_packages').update({
          ...names, session_count: sessions, price_usd: price,
          validity_days: f.validity ? parseInt(f.validity, 10) : null,
          discipline_id: f.disciplineId || null,
        }).eq('id', editing.id)
      }
      return supabase.from('pt_packages').insert({
        gym_id: gymId, ...names,
        session_count: sessions, price_usd: price, price_lbp: 0,
        validity_days: f.validity ? parseInt(f.validity, 10) : null,
        discipline_id: f.disciplineId || null,
        is_active: true, show_on_landing: false,
      })
    })

  const patch = (id: string, fields: Record<string, unknown>) =>
    run(async () => createClient().from('pt_packages').update(fields).eq('id', id))

  const steps: WizardStep[] = [
    {
      key: 'basics', title: t('nameEn'), valid: f.en.trim() !== '',
      content: (
        <div className="space-y-3">
          <F label={t('nameEn')}><Input data-testid="ptpkg-add-en" value={f.en} onChange={(e) => setF((p) => ({ ...p, en: e.target.value }))} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label={t('nameAr')}><Input dir="rtl" data-testid="ptpkg-add-ar" value={f.ar} onChange={(e) => setF((p) => ({ ...p, ar: e.target.value }))} /></F>
            <F label={t('nameFr')}><Input data-testid="ptpkg-add-fr" value={f.fr} onChange={(e) => setF((p) => ({ ...p, fr: e.target.value }))} /></F>
          </div>
        </div>
      ),
    },
    {
      key: 'details', title: t('sessions'),
      valid: Number.isFinite(parseInt(f.sessions, 10)) && parseInt(f.sessions, 10) > 0 && Number.isFinite(parseFloat(f.price)) && parseFloat(f.price) >= 0,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <F label={t('sessions')}><Input data-testid="ptpkg-add-sessions" type="number" min="1" value={f.sessions} onChange={(e) => setF((p) => ({ ...p, sessions: e.target.value }))} /></F>
            <F label={t('priceUsd')}><div className="flex items-center gap-1"><Input data-testid="ptpkg-add-price" type="number" min="0" step="0.01" className="flex-1" value={f.price} onChange={(e) => setF((p) => ({ ...p, price: e.target.value }))} /><button type="button" data-testid="ptpkg-free" onClick={() => setF((p) => ({ ...p, price: '0' }))} className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium', f.price.trim() !== '' && Number(f.price) === 0 ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}>{tc('free')}</button></div></F>
            <F label={t('validityDays')}><Input data-testid="ptpkg-add-validity" type="number" min="1" value={f.validity} onChange={(e) => setF((p) => ({ ...p, validity: e.target.value }))} /></F>
          </div>
          {disciplines.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-400">{t('disciplineOptional')}</span>
              {disciplines.map((d) => (
                <button key={d.id} type="button" data-testid="ptpkg-disc-chip" data-id={d.id}
                  onClick={() => setF((p) => ({ ...p, disciplineId: p.disciplineId === d.id ? '' : d.id }))}
                  className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
                    f.disciplineId === d.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}>
                  {lname(d)}
                </button>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className={cn('space-y-3 rounded-2xl border bg-white p-4 shadow-sm', isRTL && 'text-right')} data-testid="ptpkg-manager">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
        <Button size="sm" data-testid="ptpkg-add-btn" disabled={busy} onClick={openCreate} className="shrink-0 bg-primary-700 hover:bg-primary-800">
          <Plus className="me-1 h-4 w-4" /> {t('add')}
        </Button>
      </div>
      {error && <p data-testid="ptpkg-error" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* Rows */}
      <ul className="divide-y">
        {types.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2"
            data-testid="ptpkg-row" data-name-en={p.name_en} data-active={p.is_active !== false}>
            <span className="min-w-0">
              <span className={cn('text-sm font-medium', p.is_active === false ? 'text-gray-400 line-through' : 'text-gray-800')}>
                {lname(p)}
              </span>
              <span className="ms-2 text-xs text-gray-500">
                {p.session_count} {t('sessionsShort')} · ${Number(p.price_usd ?? 0).toFixed(0)}
                {p.validity_days ? ` · ${p.validity_days}${t('daysShort')}` : ''}
                {p.discipline_id ? ` · ${lname(disciplines.find((d) => d.id === p.discipline_id) ?? {})}` : ''}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {/* Landing staging toggle (the ADM-1 publish-gate pattern) */}
              <button type="button" data-testid="ptpkg-landing-toggle" data-on={!!p.show_on_landing} disabled={busy}
                onClick={() => patch(p.id!, { show_on_landing: !p.show_on_landing })}
                className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium',
                  p.show_on_landing ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-400')}>
                <Globe className="h-3 w-3" /> {p.show_on_landing ? t('onLanding') : t('staged')}
              </button>
              <Button size="sm" variant="ghost" data-testid="ptpkg-edit-btn" disabled={busy} onClick={() => openEdit(p)}>
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </Button>
              {p.is_active !== false ? (
                <Button size="sm" variant="ghost" data-testid="ptpkg-archive-btn" disabled={busy}
                  className="text-red-500 hover:bg-red-50" onClick={() => patch(p.id!, { is_active: false, show_on_landing: false })}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" variant="ghost" data-testid="ptpkg-restore-btn" disabled={busy}
                  className="text-green-600 hover:bg-green-50" onClick={() => patch(p.id!, { is_active: true })}>
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <FormWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={editing ? t('editTitle') : t('addTitle')}
        steps={steps}
        onSubmit={save}
        submitLabel={editing ? t('saveChanges') : t('add')}
        busy={busy}
        locale={locale}
        testid="ptpkg-wizard"
      />
    </div>
  )
}
