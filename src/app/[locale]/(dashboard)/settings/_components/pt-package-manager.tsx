'use client'

/**
 * PT package-type catalog CRUD (PT-1, the disciplines-manager pattern).
 * pt_packages IS the gym-scoped type catalog (see 000041 header): names,
 * sessions, price, validity, optional discipline (chips, no dropdowns),
 * show_on_landing staging toggle. Archive pattern (is_active=false), never
 * hard-delete — sold pt_assignments snapshot their numbers at sale and keep
 * rendering archived types by join. Writes via the staff-scoped RLS.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Loader2, Plus, Pencil, Archive, ArchiveRestore, Check, X, Globe } from 'lucide-react'

export type PtTypeRow = {
  id?: string; name_ar?: string; name_en?: string; name_fr?: string
  session_count?: number; price_usd?: number; validity_days?: number | null
  discipline_id?: string | null; is_active?: boolean; show_on_landing?: boolean
}
type Disc = { id: string; name_ar?: string; name_en?: string; name_fr?: string }

export function PtPackageManager({ types, disciplines, gymId, locale }: {
  types: PtTypeRow[]; disciplines: Disc[]; gymId: string; locale: string
}) {
  const t = useTranslations('settings.ptCatalog')
  const tc = useTranslations('common')
  const router = useRouter()
  const isRTL = locale === 'ar'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [add, setAdd] = useState({ en: '', ar: '', fr: '', sessions: '10', price: '', validity: '60', disciplineId: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ en: '', sessions: '', price: '', validity: '' })

  const lname = (d: { name_ar?: string; name_en?: string; name_fr?: string }) =>
    ((isRTL ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en || '')

  const run = async (fn: () => Promise<{ error: any }>) => {
    setBusy(true); setError('')
    const { error: err } = await fn()
    setBusy(false)
    if (err) { console.error('[pt-package-manager]', err); setError(tc('genericError')) } // ERROR-HARDEN: no raw pg errors
    else router.refresh()
  }

  const create = () =>
    run(async () => {
      if (!add.en.trim()) return { error: { message: t('errNameRequired') } }
      const sessions = parseInt(add.sessions, 10)
      const price = parseFloat(add.price)
      if (!Number.isFinite(sessions) || sessions <= 0 || !Number.isFinite(price) || price < 0) {
        return { error: { message: t('errNumbers') } }
      }
      const supabase = createClient()
      const res = await supabase.from('pt_packages').insert({
        gym_id: gymId,
        name_en: add.en.trim(),
        name_ar: add.ar.trim() || add.en.trim(),
        name_fr: add.fr.trim() || add.en.trim(),
        session_count: sessions,
        price_usd: price,
        price_lbp: 0,
        validity_days: add.validity ? parseInt(add.validity, 10) : null,
        discipline_id: add.disciplineId || null,
        is_active: true,
        show_on_landing: false,
      })
      if (!res.error) setAdd({ en: '', ar: '', fr: '', sessions: '10', price: '', validity: '60', disciplineId: '' })
      return res
    })

  const saveEdit = (id: string) =>
    run(async () => {
      if (!edit.en.trim()) return { error: { message: t('errNameRequired') } }
      const supabase = createClient()
      const res = await supabase.from('pt_packages').update({
        name_en: edit.en.trim(),
        session_count: parseInt(edit.sessions, 10) || 1,
        price_usd: parseFloat(edit.price) || 0,
        validity_days: edit.validity ? parseInt(edit.validity, 10) : null,
      }).eq('id', id)
      if (!res.error) setEditId(null)
      return res
    })

  const patch = (id: string, fields: Record<string, unknown>) =>
    run(async () => createClient().from('pt_packages').update(fields).eq('id', id))

  return (
    <div className={cn('space-y-3 rounded-2xl border bg-white p-4 shadow-sm', isRTL && 'rtl text-right')} data-testid="ptpkg-manager">
      <div>
        <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
        <p className="text-xs text-gray-500">{t('subtitle')}</p>
      </div>
      {error && <p data-testid="ptpkg-error" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* Add row */}
      <div className="flex flex-wrap items-center gap-2">
        <Input data-testid="ptpkg-add-en" placeholder={t('nameEn')} value={add.en} onChange={(e) => setAdd((p) => ({ ...p, en: e.target.value }))} className="h-9 w-36" />
        <Input data-testid="ptpkg-add-ar" dir="rtl" placeholder={t('nameAr')} value={add.ar} onChange={(e) => setAdd((p) => ({ ...p, ar: e.target.value }))} className="h-9 w-32" />
        <Input data-testid="ptpkg-add-fr" placeholder={t('nameFr')} value={add.fr} onChange={(e) => setAdd((p) => ({ ...p, fr: e.target.value }))} className="h-9 w-32" />
        <Input data-testid="ptpkg-add-sessions" type="number" min="1" placeholder={t('sessions')} value={add.sessions} onChange={(e) => setAdd((p) => ({ ...p, sessions: e.target.value }))} className="h-9 w-24" />
        <Input data-testid="ptpkg-add-price" type="number" min="0" step="0.01" placeholder={t('priceUsd')} value={add.price} onChange={(e) => setAdd((p) => ({ ...p, price: e.target.value }))} className="h-9 w-24" />
        <Input data-testid="ptpkg-add-validity" type="number" min="1" placeholder={t('validityDays')} value={add.validity} onChange={(e) => setAdd((p) => ({ ...p, validity: e.target.value }))} className="h-9 w-24" />
        <Button size="sm" data-testid="ptpkg-add-btn" disabled={busy} onClick={create} className="bg-[#cd1419] hover:bg-[#a81014]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="me-1 h-4 w-4" />} {t('add')}
        </Button>
      </div>
      {/* Optional discipline chips for the add row */}
      {disciplines.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400">{t('disciplineOptional')}</span>
          {disciplines.map((d) => (
            <button key={d.id} type="button" data-testid="ptpkg-disc-chip" data-id={d.id}
              onClick={() => setAdd((p) => ({ ...p, disciplineId: p.disciplineId === d.id ? '' : d.id }))}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
                add.disciplineId === d.id ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}>
              {lname(d)}
            </button>
          ))}
        </div>
      )}

      {/* Rows */}
      <ul className="divide-y">
        {types.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2"
            data-testid="ptpkg-row" data-name-en={p.name_en} data-active={p.is_active !== false}>
            {editId === p.id ? (
              <span className="flex flex-wrap items-center gap-2">
                <Input value={edit.en} onChange={(e) => setEdit((s) => ({ ...s, en: e.target.value }))} className="h-8 w-32" />
                <Input type="number" value={edit.sessions} onChange={(e) => setEdit((s) => ({ ...s, sessions: e.target.value }))} className="h-8 w-20" />
                <Input type="number" value={edit.price} onChange={(e) => setEdit((s) => ({ ...s, price: e.target.value }))} className="h-8 w-20" />
                <Input type="number" value={edit.validity} onChange={(e) => setEdit((s) => ({ ...s, validity: e.target.value }))} className="h-8 w-20" />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => saveEdit(p.id!)} data-testid="ptpkg-edit-save">
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
              </span>
            ) : (
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
            )}
            <span className="flex items-center gap-1.5">
              {/* Landing staging toggle (the ADM-1 publish-gate pattern) */}
              <button type="button" data-testid="ptpkg-landing-toggle" data-on={!!p.show_on_landing} disabled={busy}
                onClick={() => patch(p.id!, { show_on_landing: !p.show_on_landing })}
                className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium',
                  p.show_on_landing ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-400')}>
                <Globe className="h-3 w-3" /> {p.show_on_landing ? t('onLanding') : t('staged')}
              </button>
              {editId !== p.id && (
                <Button size="sm" variant="ghost" data-testid="ptpkg-edit-btn" disabled={busy}
                  onClick={() => { setEditId(p.id!); setEdit({ en: p.name_en || '', sessions: String(p.session_count ?? ''), price: String(p.price_usd ?? ''), validity: String(p.validity_days ?? '') }) }}>
                  <Pencil className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              )}
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
    </div>
  )
}
