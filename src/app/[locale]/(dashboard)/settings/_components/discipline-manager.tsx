'use client'

/**
 * Disciplines CRUD (ADM-1). The SSOT for class-wizard chips, coach specialty chips,
 * the timetable colors/filters and the public landing section. A gym's list is tenant
 * DATA entered here — never a platform constant. Archive pattern (is_active=false),
 * never hard-delete. Writes via the staff-scoped disciplines RLS.
 *
 * M2-D WIZARD-POLISH: create/edit rides the shared FormWizard (was an inline add-row +
 * in-row edit). Disciplines are name-only, so it's a single chunked step. The write
 * paths are unchanged (insert + default-ladder seed on create; name update on edit).
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormWizard, type WizardStep } from '@/components/shared/form-wizard'
import { downscaleImage } from '@/components/shared/avatar-upload'
import { DisciplineIcon } from '@/components/dashboard/discipline-icon'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Archive, ArchiveRestore, ImagePlus, Loader2, X } from 'lucide-react'

type Row = { id?: string; name_ar?: string; name_en?: string; name_fr?: string; sort_order?: number; is_active?: boolean; icon_url?: string | null }

// ADM-2: a discipline without belt_hierarchies makes belt promotion impossible (empty
// target-rank picker). New disciplines get the standard 20-rank default ladder as
// editable per-gym DATA (same template the seeds use).
const DEFAULT_LADDER: [string, string, string, string, number, number, number, boolean][] = [
  ['white', 'أبيض', 'White', 'Blanche', 1, 1, 8, false],
  ['white_yellow', 'أبيض/أصفر', 'White/Yellow', 'Blanc/Jaune', 2, 2, 16, false],
  ['yellow', 'أصفر', 'Yellow', 'Jaune', 3, 2, 20, false],
  ['yellow_orange', 'أصفر/برتقالي', 'Yellow/Orange', 'Jaune/Orange', 4, 3, 24, false],
  ['orange', 'برتقالي', 'Orange', 'Orange', 5, 3, 24, false],
  ['orange_green', 'برتقالي/أخضر', 'Orange/Green', 'Orange/Vert', 6, 3, 28, false],
  ['green', 'أخضر', 'Green', 'Verte', 7, 4, 32, false],
  ['green_blue', 'أخضر/أزرق', 'Green/Blue', 'Vert/Bleu', 8, 4, 36, false],
  ['blue', 'أزرق', 'Blue', 'Bleue', 9, 4, 40, false],
  ['blue_purple', 'أزرق/أرجواني', 'Blue/Purple', 'Bleu/Violet', 10, 5, 44, false],
  ['purple', 'أرجواني', 'Purple', 'Violette', 11, 5, 48, false],
  ['purple_brown', 'أرجواني/بني', 'Purple/Brown', 'Violet/Marron', 12, 6, 52, false],
  ['brown', 'بني', 'Brown', 'Marron', 13, 6, 56, false],
  ['brown_black', 'بني/أسود', 'Brown/Black', 'Marron/Noir', 14, 6, 60, false],
  ['red', 'أحمر', 'Red', 'Rouge', 15, 8, 80, false],
  ['black_1', 'أسود °1', 'Black 1°', 'Noir 1°', 16, 12, 120, true],
  ['black_2', 'أسود °2', 'Black 2°', 'Noir 2°', 17, 12, 120, true],
  ['black_3', 'أسود °3', 'Black 3°', 'Noir 3°', 18, 12, 120, true],
  ['black_4', 'أسود °4', 'Black 4°', 'Noir 4°', 19, 12, 120, true],
  ['black_5', 'أسود °5', 'Black 5°', 'Noir 5°', 20, 12, 120, true],
]

// FORM-FOCUS-SWEEP: module-scope labelled field (an in-render component remounts <Input>).
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function DisciplineManager({ disciplines, gymId, locale }: { disciplines: Row[]; gymId: string; locale: string }) {
  const t = useTranslations('settings.discipline')
  const tc = useTranslations('common')
  const router = useRouter()
  const isRTL = locale === 'ar'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [f, setF] = useState({ en: '', ar: '', fr: '' })
  // DISC-ICON: the optional uploaded icon — a RELATIVE gym-landing path (or null),
  // uploaded on pick (avatar/landing pattern) so submit only persists the path.
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [iconBusy, setIconBusy] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const lname = (d: Row) => ((isRTL ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en || '')
  const sorted = [...disciplines].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  const openCreate = () => { setEditing(null); setF({ en: '', ar: '', fr: '' }); setIconUrl(null); setError(''); setWizardOpen(true) }
  const openEdit = (d: Row) => { setEditing(d); setF({ en: d.name_en || '', ar: d.name_ar || '', fr: d.name_fr || '' }); setIconUrl(d.icon_url ?? null); setError(''); setWizardOpen(true) }

  // DISC-ICON: downscale (≤256px, HEIC-safe via the shared avatar pipeline) → upload
  // to the public `gym-landing` bucket at <gym>/disciplines/<uuid>.jpg (the folder
  // equals the caller's gym for the 000079 insert policy) → keep the RELATIVE path.
  const pickIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIconBusy(true)
    setError('')
    try {
      const blob = await downscaleImage(file, 256, 0.85)
      const path = `${gymId}/disciplines/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await createClient().storage.from('gym-landing').upload(path, blob, {
        upsert: true, contentType: 'image/jpeg', cacheControl: '3600',
      })
      if (upErr) throw upErr
      setIconUrl(path)
    } catch (err) {
      console.error('[discipline-manager] icon', err) // ERROR-HARDEN: no raw pg/storage errors
      setError(tc('genericError'))
    } finally {
      setIconBusy(false)
      if (iconInputRef.current) iconInputRef.current.value = ''
    }
  }

  const run = async (fn: () => Promise<{ error: any }>) => {
    setBusy(true)
    setError('')
    const { error: err } = await fn()
    setBusy(false)
    if (err) { console.error('[discipline-manager]', err); setError(tc('genericError')) } // ERROR-HARDEN: no raw pg errors
    else { setWizardOpen(false); router.refresh() }
  }

  // Write paths UNCHANGED from the inline editor — insert (+ default-ladder seed) on
  // create, name update on edit; the en→ar/fr fallback is preserved.
  const save = () =>
    run(async () => {
      if (!f.en.trim()) return { error: { message: t('errNameRequired') } }
      const supabase = createClient()
      if (editing?.id) {
        return supabase.from('disciplines').update({
          name_en: f.en.trim(), name_ar: f.ar.trim() || f.en.trim(), name_fr: f.fr.trim() || f.en.trim(),
          icon_url: iconUrl, // DISC-ICON: relative path or null (cleared)
        }).eq('id', editing.id)
      }
      const maxSort = Math.max(0, ...disciplines.map((d) => d.sort_order || 0))
      const res = await supabase.from('disciplines').insert({
        gym_id: gymId,
        name_en: f.en.trim(), name_ar: f.ar.trim() || f.en.trim(), name_fr: f.fr.trim() || f.en.trim(),
        sort_order: maxSort + 1, is_active: true, icon_url: iconUrl, // DISC-ICON
      }).select('id').single()
      if (!res.error && res.data) {
        // Seed the default ladder so promotion works immediately (editable data).
        const ladderRes = await supabase.from('belt_hierarchies').insert(
          DEFAULT_LADDER.map(([rank, ar, en, fr, so, mm, mc, bb]) => ({
            discipline_id: res.data.id,
            rank, name_ar: ar, name_en: en, name_fr: fr,
            sort_order: so, min_months_in_rank: mm, min_classes_attended: mc, is_black_belt: bb,
          })),
        )
        if (ladderRes.error) return ladderRes
      }
      return res
    })

  const setActive = (id: string, active: boolean) =>
    run(async () => createClient().from('disciplines').update({ is_active: active }).eq('id', id))

  const steps: WizardStep[] = [
    {
      key: 'basics', title: t('nameEn'), valid: f.en.trim() !== '',
      content: (
        <div className="space-y-3">
          <F label={t('nameEn')}><Input data-testid="discipline-add-en" value={f.en} onChange={(e) => setF((p) => ({ ...p, en: e.target.value }))} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label={t('nameAr')}><Input dir="rtl" data-testid="discipline-add-ar" value={f.ar} onChange={(e) => setF((p) => ({ ...p, ar: e.target.value }))} /></F>
            <F label={t('nameFr')}><Input data-testid="discipline-add-fr" value={f.fr} onChange={(e) => setF((p) => ({ ...p, fr: e.target.value }))} /></F>
          </div>
          {/* DISC-ICON: optional icon — upload-on-pick, emoji-free initial preview until set. */}
          <F label={t('icon')}>
            <div className="flex items-center gap-3">
              <DisciplineIcon iconUrl={iconUrl} name={f.en || f.ar || f.fr} size="md" />
              <input ref={iconInputRef} type="file" accept="image/*" className="hidden" data-testid="discipline-icon-input" onChange={pickIcon} />
              <Button type="button" size="sm" variant="outline" data-testid="discipline-icon-btn" disabled={iconBusy} onClick={() => iconInputRef.current?.click()}>
                {iconBusy ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="me-1 h-3.5 w-3.5" />}
                {t('icon')}
              </Button>
              {iconUrl && (
                <Button type="button" size="sm" variant="ghost" data-testid="discipline-icon-remove" disabled={iconBusy}
                  className="text-red-500 hover:bg-red-50" onClick={() => setIconUrl(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">{t('iconHint')}</p>
          </F>
        </div>
      ),
    },
  ]

  return (
    <div className={cn('mb-5 space-y-3 rounded-2xl border bg-white p-4 shadow-sm', isRTL && 'rtl text-right')} data-testid="discipline-manager">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('manageTitle')}</h3>
        <Button size="sm" data-testid="discipline-add-btn" disabled={busy} onClick={openCreate} className="bg-[#cd1419] hover:bg-[#a81014]">
          <Plus className="me-1 h-4 w-4" /> {t('add')}
        </Button>
      </div>
      {error && <p data-testid="discipline-error" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* Rows */}
      <ul className="divide-y">
        {sorted.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="discipline-row" data-name-en={d.name_en} data-active={d.is_active !== false}>
            <span className="flex min-w-0 items-center gap-2">
              <DisciplineIcon iconUrl={d.icon_url} name={lname(d)} size="sm" className={cn(d.is_active === false && 'opacity-40')} />
              <span className={cn('truncate text-sm font-medium', d.is_active === false ? 'text-gray-400 line-through' : 'text-gray-800')}>
                {lname(d)}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" data-testid="discipline-edit-btn" disabled={busy} onClick={() => openEdit(d)}>
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </Button>
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

      <FormWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={editing ? t('editTitle') : t('addTitle')}
        steps={steps}
        onSubmit={save}
        submitLabel={editing ? t('saveChanges') : t('add')}
        busy={busy}
        locale={locale}
        testid="discipline-wizard"
      />
    </div>
  )
}
