'use client'

/**
 * Disciplines CRUD (ADM-1). The settings disciplines tab was read-only display —
 * there was NO way to add/edit/deactivate a discipline anywhere in admin, even
 * though disciplines are the SSOT for class-wizard chips, coach specialty chips,
 * the timetable colors/filters and the public landing section. A gym's list
 * (e.g. Proline's Muay Thai / Kick Boxing / Boxing / MMA) is tenant DATA entered
 * here — never a platform constant. Archive pattern (is_active=false), never
 * hard-delete. Writes via the staff-scoped disciplines RLS.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Loader2, Plus, Pencil, Archive, ArchiveRestore, Check, X } from 'lucide-react'

type Row = { id?: string; name_ar?: string; name_en?: string; name_fr?: string; sort_order?: number; is_active?: boolean }

export function DisciplineManager({ disciplines, gymId, locale }: { disciplines: Row[]; gymId: string; locale: string }) {
  const t = useTranslations('settings.discipline')
  const router = useRouter()
  const isRTL = locale === 'ar'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addEn, setAddEn] = useState('')
  const [addAr, setAddAr] = useState('')
  const [addFr, setAddFr] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ en: string; ar: string; fr: string }>({ en: '', ar: '', fr: '' })

  const lname = (d: Row) => ((isRTL ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en || '')
  const sorted = [...disciplines].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  const run = async (fn: () => Promise<{ error: any }>) => {
    setBusy(true)
    setError('')
    const { error: err } = await fn()
    setBusy(false)
    if (err) setError(err.message)
    else router.refresh()
  }

  const add = () =>
    run(async () => {
      if (!addEn.trim()) return { error: { message: t('errNameRequired') } }
      const supabase = createClient()
      const maxSort = Math.max(0, ...disciplines.map((d) => d.sort_order || 0))
      const res = await supabase.from('disciplines').insert({
        gym_id: gymId,
        name_en: addEn.trim(),
        name_ar: addAr.trim() || addEn.trim(),
        name_fr: addFr.trim() || addEn.trim(),
        sort_order: maxSort + 1,
        is_active: true,
      })
      if (!res.error) { setAddEn(''); setAddAr(''); setAddFr('') }
      return res
    })

  const saveEdit = (id: string) =>
    run(async () => {
      if (!edit.en.trim()) return { error: { message: t('errNameRequired') } }
      const supabase = createClient()
      const res = await supabase.from('disciplines').update({
        name_en: edit.en.trim(),
        name_ar: edit.ar.trim() || edit.en.trim(),
        name_fr: edit.fr.trim() || edit.en.trim(),
      }).eq('id', id)
      if (!res.error) setEditId(null)
      return res
    })

  const setActive = (id: string, active: boolean) =>
    run(async () => {
      const supabase = createClient()
      return supabase.from('disciplines').update({ is_active: active }).eq('id', id)
    })

  return (
    <div className={cn('mb-5 space-y-3 rounded-2xl border bg-white p-4 shadow-sm', isRTL && 'rtl text-right')} data-testid="discipline-manager">
      <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('manageTitle')}</h3>
      {error && <p data-testid="discipline-error" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* Add row */}
      <div className="flex flex-wrap items-center gap-2">
        <Input data-testid="discipline-add-en" placeholder={t('nameEn')} value={addEn} onChange={(e) => setAddEn(e.target.value)} className="h-9 w-40" />
        <Input data-testid="discipline-add-ar" dir="rtl" placeholder={t('nameAr')} value={addAr} onChange={(e) => setAddAr(e.target.value)} className="h-9 w-40" />
        <Input data-testid="discipline-add-fr" placeholder={t('nameFr')} value={addFr} onChange={(e) => setAddFr(e.target.value)} className="h-9 w-40" />
        <Button size="sm" data-testid="discipline-add-btn" disabled={busy} onClick={add} className="bg-[#cd1419] hover:bg-[#a81014]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} {t('add')}
        </Button>
      </div>

      {/* Rows */}
      <ul className="divide-y">
        {sorted.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="discipline-row" data-name-en={d.name_en} data-active={d.is_active !== false}>
            {editId === d.id ? (
              <span className="flex flex-wrap items-center gap-2">
                <Input value={edit.en} onChange={(e) => setEdit((p) => ({ ...p, en: e.target.value }))} className="h-8 w-36" />
                <Input dir="rtl" value={edit.ar} onChange={(e) => setEdit((p) => ({ ...p, ar: e.target.value }))} className="h-8 w-36" />
                <Input value={edit.fr} onChange={(e) => setEdit((p) => ({ ...p, fr: e.target.value }))} className="h-8 w-36" />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => saveEdit(d.id!)} data-testid="discipline-edit-save">
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
              </span>
            ) : (
              <span className={cn('text-sm font-medium', d.is_active === false ? 'text-gray-400 line-through' : 'text-gray-800')}>
                {lname(d)}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              {editId !== d.id && (
                <Button size="sm" variant="ghost" data-testid="discipline-edit-btn" disabled={busy}
                  onClick={() => { setEditId(d.id!); setEdit({ en: d.name_en || '', ar: d.name_ar || '', fr: d.name_fr || '' }) }}>
                  <Pencil className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              )}
              {d.is_active !== false ? (
                <Button size="sm" variant="ghost" data-testid="discipline-archive-btn" disabled={busy}
                  className="text-red-500 hover:bg-red-50" onClick={() => setActive(d.id!, false)}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" variant="ghost" data-testid="discipline-restore-btn" disabled={busy}
                  className="text-green-600 hover:bg-green-50" onClick={() => setActive(d.id!, true)}>
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
