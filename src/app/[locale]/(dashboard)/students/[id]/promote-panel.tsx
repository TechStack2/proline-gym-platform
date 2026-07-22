'use client'

/**
 * Member-360 belt promotion (ADM-2, operator ask): promote from the member file
 * — student pre-selected, ACTIVE discipline chips, target rank defaulting to
 * the NEXT rank in that discipline's belt_hierarchies order, coach chips,
 * optional note/date. The write is the verified 24R path: the promoteStudent
 * server action → promote_student RPC (atomic, staff-gated, forward-only) +
 * the belt_promoted notification (F2) — nothing re-implemented here.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Loader2, Award } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { promoteStudent } from '../../belts/actions'
import { useErrorText } from '@/lib/errors/use-error-text';

type Hierarchy = { id: string; discipline_id: string; rank: string; name_ar: string; name_en: string; name_fr: string; sort_order: number }
type Disc = { id: string; name_ar: string; name_en: string; name_fr: string }
type Coach = { id: string; name: string }

export function PromotePanel({
  studentId, currentRank, disciplines, hierarchies, coaches, locale,
}: {
  studentId: string
  currentRank: string | null
  disciplines: Disc[]
  hierarchies: Hierarchy[]
  coaches: Coach[]
  locale: string
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('promote')
  const errText = useErrorText();
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [disciplineId, setDisciplineId] = useState('')
  const [hierarchyId, setHierarchyId] = useState('')
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')

  const lname = (row: any) => ((isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || '')

  const ladder = useMemo(
    () => hierarchies.filter((h) => h.discipline_id === disciplineId).sort((a, b) => a.sort_order - b.sort_order),
    [hierarchies, disciplineId],
  )
  // Forward-only choices: ranks ABOVE the student's current rank in this ladder.
  const currentSort = useMemo(() => {
    const cur = ladder.find((h) => h.rank === currentRank)
    return cur?.sort_order ?? 0
  }, [ladder, currentRank])
  const choices = useMemo(() => ladder.filter((h) => h.sort_order > currentSort), [ladder, currentSort])

  const pickDiscipline = (id: string) => {
    setDisciplineId(id)
    const l = hierarchies.filter((h) => h.discipline_id === id).sort((a, b) => a.sort_order - b.sort_order)
    const cur = l.find((h) => h.rank === currentRank)
    const next = l.find((h) => h.sort_order > (cur?.sort_order ?? 0))
    setHierarchyId(next?.id ?? '') // default = the NEXT rank in order
  }

  const submit = async () => {
    if (!disciplineId || !hierarchyId || !coachId) {
      toast({ title: t('errIncomplete'), variant: 'destructive' })
      return
    }
    setBusy(true)
    const res = await promoteStudent({
      studentId, disciplineId, toHierarchyId: hierarchyId, coachId,
      promotionDate: date, notes: note.trim() || undefined,
    })
    setBusy(false)
    if (res.ok) {
      toast({ title: t('success'), variant: 'success' })
      setOpen(false); setDisciplineId(''); setHierarchyId(''); setNote('')
      router.refresh()
    } else {
      toast({ title: t('errFailed'), description: errText(res.error), variant: 'destructive' })
    }
  }

  return (
    <div className="mt-3 border-t pt-3" data-testid="promote-panel">
      {!open ? (
        <Button size="sm" data-testid="promote-open" onClick={() => setOpen(true)} className="bg-primary-700 hover:bg-primary-800">
          <Award className="me-1 h-4 w-4" /> {t('promote')}
        </Button>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600">{t('discipline')}</p>
            <div className="flex flex-wrap gap-1.5">
              {disciplines.map((d) => (
                <button key={d.id} type="button" data-testid="promote-discipline-chip" data-id={d.id}
                  onClick={() => pickDiscipline(d.id)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                    disciplineId === d.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                  {lname(d)}
                </button>
              ))}
            </div>
          </div>

          {disciplineId && (
            choices.length === 0 ? (
              <p className="tint-warning rounded-lg px-3 py-2 text-xs" data-testid="promote-no-ladder">
                {ladder.length === 0 ? t('noLadder') : t('topRank')}
              </p>
            ) : (
              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-600">{t('targetRank')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {choices.slice(0, 6).map((h) => (
                    <button key={h.id} type="button" data-testid="promote-rank-pill" data-rank={h.rank}
                      onClick={() => setHierarchyId(h.id)}
                      className={cn('rounded-full border px-3 py-1.5 text-xs font-medium capitalize',
                        hierarchyId === h.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                      {lname(h)}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600">{t('coach')}</p>
            <div className="flex flex-wrap gap-1.5">
              {coaches.map((c) => (
                <button key={c.id} type="button" data-testid="promote-coach-chip" data-id={c.id}
                  onClick={() => setCoachId(c.id)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                    coachId === c.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" data-testid="promote-date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
            <Input data-testid="promote-note" placeholder={t('notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} className="h-9 flex-1" />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" data-testid="promote-submit" disabled={busy || !hierarchyId} onClick={submit}
              className="bg-primary-700 hover:bg-primary-800">
              {busy ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Award className="me-1 h-4 w-4" />} {t('confirm')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
