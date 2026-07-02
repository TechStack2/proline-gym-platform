'use client'

/**
 * Belt-ladder editor (UX-2) — the durable "empty ladders" fix at the CONFIG
 * level: per-discipline rank CRUD on belt_hierarchies. ADM-2 seeded a default
 * 20-rank ladder for NEW disciplines; this editor lets a gym shape any ladder
 * (add/rename/reorder/archive) including pre-ADM-2 ones, so promotion targets
 * are always definable. `rank` is the belt_rank_enum (DB) — adding offers
 * CHIPS of the discipline's UNUSED enum values, never free text. Reorder is
 * tap up/down (sort_order swap, no drag dependency); archive sets is_active
 * =false (000049) and every promotion/filter consumer reads is_active=true.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { FormWizard } from '@/components/shared/form-wizard'
import { Plus, Pencil, Archive, ArchiveRestore, ChevronUp, ChevronDown } from 'lucide-react'

const BELT_RANKS = [
  'white', 'white_yellow', 'yellow', 'yellow_orange',
  'orange', 'orange_green', 'green', 'green_blue',
  'blue', 'blue_purple', 'purple', 'purple_brown',
  'brown', 'brown_black', 'red',
  'black_1', 'black_2', 'black_3', 'black_4', 'black_5',
] as const

type BeltRow = {
  id?: string
  discipline_id?: string
  rank?: string
  name_ar?: string
  name_en?: string
  name_fr?: string
  sort_order?: number
  is_black_belt?: boolean
  is_active?: boolean
}

type DisciplineRow = { id?: string; name_ar?: string; name_en?: string; name_fr?: string; is_active?: boolean; belt_hierarchies?: BeltRow[] | BeltRow }

function rows(val: BeltRow[] | BeltRow | undefined): BeltRow[] {
  return Array.isArray(val) ? val : val ? [val] : []
}

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was remounting its subtree each render.
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function BeltLadderManager({ disciplines, locale }: { disciplines: DisciplineRow[]; locale: string }) {
  const t = useTranslations('settings.beltLadder')
  const router = useRouter()
  const isRTL = locale === 'ar'

  const active = disciplines.filter((d) => d.is_active !== false)
  const [discId, setDiscId] = useState(active[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // wizard state — null closed, {} add, row edit
  const [editing, setEditing] = useState<BeltRow | null>(null)
  const [rank, setRank] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [nameFr, setNameFr] = useState('')

  const lname = (x: { name_ar?: string; name_en?: string; name_fr?: string }) =>
    ((isRTL ? x.name_ar : locale === 'fr' ? x.name_fr : x.name_en) || x.name_en || '')

  const disc = active.find((d) => d.id === discId)
  const ladder = useMemo(
    () => rows(disc?.belt_hierarchies).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [disc],
  )
  const liveLadder = ladder.filter((b) => b.is_active !== false)
  const archivedLadder = ladder.filter((b) => b.is_active === false)
  // The enum is the namespace per discipline — unused values only (incl. archived rows' ranks).
  const unusedRanks = BELT_RANKS.filter((r) => !ladder.some((b) => b.rank === r))

  const run = async (fn: () => Promise<{ error: any }>) => {
    setBusy(true)
    setError('')
    const { error: err } = await fn()
    setBusy(false)
    if (err) setError(err.message)
    else router.refresh()
  }

  const openWizard = (b: BeltRow | null) => {
    setRank(b?.rank ?? '')
    setNameEn(b?.name_en ?? '')
    setNameAr(b?.name_ar ?? '')
    setNameFr(b?.name_fr ?? '')
    setEditing(b ?? {})
  }

  const submit = () =>
    run(async () => {
      const supabase = createClient()
      const names = {
        name_en: nameEn.trim(),
        name_ar: nameAr.trim() || nameEn.trim(),
        name_fr: nameFr.trim() || nameEn.trim(),
      }
      if (editing?.id) {
        const res = await supabase.from('belt_hierarchies').update(names).eq('id', editing.id)
        if (!res.error) setEditing(null)
        return res
      }
      const maxSort = Math.max(0, ...ladder.map((b) => b.sort_order || 0))
      const res = await supabase.from('belt_hierarchies').insert({
        discipline_id: discId,
        rank,
        ...names,
        sort_order: maxSort + 1,
        is_black_belt: rank.startsWith('black_'),
        min_months_in_rank: 1,
        min_classes_attended: 8,
      })
      if (!res.error) setEditing(null)
      return res
    })

  const move = (b: BeltRow, dir: -1 | 1) => {
    const idx = liveLadder.findIndex((x) => x.id === b.id)
    const other = liveLadder[idx + dir]
    if (!other) return
    void run(async () => {
      const supabase = createClient()
      // Swap sort_order (tap reorder, no drag dependency).
      const r1 = await supabase.from('belt_hierarchies').update({ sort_order: other.sort_order }).eq('id', b.id!)
      if (r1.error) return r1
      return supabase.from('belt_hierarchies').update({ sort_order: b.sort_order }).eq('id', other.id!)
    })
  }

  const setActive_ = (id: string, isActive: boolean) =>
    run(async () => {
      const supabase = createClient()
      return supabase.from('belt_hierarchies').update({ is_active: isActive }).eq('id', id)
    })

  const steps = [
    // Rank step only when ADDING (rank is the row's enum identity — not editable).
    ...(editing && !editing.id ? [{
      key: 'rank',
      title: t('stepRank'),
      valid: rank !== '',
      content: (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('rankHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {unusedRanks.map((r) => (
              <button key={r} type="button" data-testid="belt-rank-chip" data-value={r}
                onClick={() => {
                  setRank(r)
                  if (!nameEn.trim()) setNameEn(r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
                }}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                  rank === r ? 'border-[#cd1419] bg-[#cd1419] text-white' : 'border-gray-200 bg-white text-gray-700')}>
                {r.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          {unusedRanks.length === 0 && <p className="text-xs text-amber-600">{t('allRanksUsed')}</p>}
        </div>
      ),
    }] : []),
    {
      key: 'names',
      title: t('stepNames'),
      valid: nameEn.trim() !== '',
      content: (
        <div className="space-y-3">
          <F label={`${t('nameEn')} *`}><Input data-testid="belt-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></F>
          <F label={t('nameAr')}><Input dir="rtl" data-testid="belt-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></F>
          <F label={t('nameFr')}><Input data-testid="belt-name-fr" value={nameFr} onChange={(e) => setNameFr(e.target.value)} /></F>
        </div>
      ),
    },
    {
      key: 'review',
      title: t('stepReview'),
      content: (
        <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700" data-testid="belt-review">
          <p className="font-semibold text-gray-900">{nameEn}</p>
          {!editing?.id && <p className="text-xs text-gray-500">{rank.replace(/_/g, ' ')}</p>}
        </div>
      ),
    },
  ]

  return (
    <div className={cn('mb-5 space-y-3 rounded-2xl border bg-white p-4 shadow-sm', isRTL && 'rtl text-right')} data-testid="belt-ladder-manager">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
        <Button size="sm" data-testid="belt-add-btn" disabled={busy || !discId || unusedRanks.length === 0}
          onClick={() => openWizard(null)} className="bg-[#cd1419] hover:bg-[#a81014]">
          <Plus className="mr-1 h-4 w-4" /> {t('addRank')}
        </Button>
      </div>
      {error && <p data-testid="belt-ladder-error" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* Discipline selector — chips, the no-dropdown convention */}
      <div className="flex flex-wrap gap-1.5">
        {active.map((d) => (
          <button key={d.id} type="button" data-testid="belt-disc-chip" data-name-en={d.name_en}
            onClick={() => setDiscId(d.id!)}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
              discId === d.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700')}>
            {lname(d)}
          </button>
        ))}
      </div>

      <ul className="divide-y">
        {liveLadder.map((b, idx) => (
          <li key={b.id} className="flex items-center justify-between gap-2 py-1.5" data-testid="belt-row" data-rank={b.rank}>
            <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <span className="w-5 text-xs text-gray-400">{idx + 1}</span>
              {lname(b)}
              <span className="text-2xs text-gray-400">{b.rank?.replace(/_/g, ' ')}</span>
            </span>
            <span className="flex items-center gap-0.5">
              <Button size="sm" variant="ghost" data-testid="belt-up-btn" disabled={busy || idx === 0} onClick={() => move(b, -1)}>
                <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
              </Button>
              <Button size="sm" variant="ghost" data-testid="belt-down-btn" disabled={busy || idx === liveLadder.length - 1} onClick={() => move(b, 1)}>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </Button>
              <Button size="sm" variant="ghost" data-testid="belt-rename-btn" disabled={busy} onClick={() => openWizard(b)}>
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </Button>
              <Button size="sm" variant="ghost" data-testid="belt-archive-btn" disabled={busy}
                className="text-red-500 hover:bg-red-50" onClick={() => setActive_(b.id!, false)}>
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </span>
          </li>
        ))}
        {liveLadder.length === 0 && <li className="py-2 text-xs text-gray-400" data-testid="belt-ladder-empty">{t('empty')}</li>}
      </ul>

      {archivedLadder.length > 0 && (
        <ul className="divide-y opacity-60">
          {archivedLadder.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-1.5" data-testid="belt-row-archived" data-rank={b.rank}>
              <span className="text-sm text-gray-400 line-through">{lname(b)}</span>
              <Button size="sm" variant="ghost" data-testid="belt-restore-btn" disabled={busy}
                className="text-green-600 hover:bg-green-50" onClick={() => setActive_(b.id!, true)}>
                <ArchiveRestore className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <FormWizard
          open
          onClose={() => setEditing(null)}
          title={editing.id ? t('renameTitle') : t('addTitle')}
          steps={steps}
          onSubmit={submit}
          submitLabel={t('save')}
          busy={busy}
          locale={locale}
          testid="belt-wizard"
        />
      )}
    </div>
  )
}
