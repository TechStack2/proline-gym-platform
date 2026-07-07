'use client'

/**
 * Coach availability editor (PT-2, UX-1 conventions — day pills + time
 * ranges, no dropdowns). Publishing a window is what makes slots member-
 * bookable; date overrides block a day (or part) or add a one-off window.
 * Writes via the coach-own RLS (staff edit through the same component under
 * the staff-gym policy).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Trash2, CalendarOff, CalendarPlus, Loader2 } from 'lucide-react'

export type AvailabilityRow = { id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }
export type OverrideRow = { id: string; date: string; kind: 'block' | 'extra'; start_time: string | null; end_time: string | null }

export function AvailabilityEditor({ coachId, gymId, windows, overrides, locale, onChanged }: {
  coachId: string
  gymId: string
  windows: AvailabilityRow[]
  overrides: OverrideRow[]
  locale: string
  /** J2 COACH-UNIFY: optional hook so a client-fed embed (the add-coach wizard) can
   *  re-fetch its own window list after a write. Coach-360/coach-pt omit it → no-op. */
  onChanged?: () => void
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('ptBooking.editor')
  const tc = useTranslations('common')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [day, setDay] = useState(2) // Tue
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('20:00')
  const [ovDate, setOvDate] = useState('')
  const [ovKind, setOvKind] = useState<'block' | 'extra'>('block')
  const [ovStart, setOvStart] = useState('')
  const [ovEnd, setOvEnd] = useState('')

  const DAYS = [0, 1, 2, 3, 4, 5, 6]
  const dayLabel = (d: number) => t(`days.${d}` as any)
  const hhmm = (v: string | null) => (v || '').slice(0, 5)

  const run = async (fn: () => Promise<{ error: any }>) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { console.error('[availability-editor]', error); toast.error(tc('genericError')) } // ERROR-HARDEN
    else { router.refresh(); onChanged?.() }
  }

  const addWindow = () =>
    run(async () => {
      if (start >= end) return { error: { message: t('errRange') } }
      return createClient().from('coach_availability').insert({
        gym_id: gymId, coach_id: coachId, day_of_week: day, start_time: start, end_time: end, is_active: true,
      })
    })

  const removeWindow = (id: string) =>
    run(async () => createClient().from('coach_availability').delete().eq('id', id))

  const addOverride = () =>
    run(async () => {
      if (!ovDate) return { error: { message: t('errDate') } }
      if (ovKind === 'extra' && (!ovStart || !ovEnd || ovStart >= ovEnd)) return { error: { message: t('errRange') } }
      const res = await createClient().from('coach_availability_overrides').insert({
        gym_id: gymId, coach_id: coachId, date: ovDate, kind: ovKind,
        start_time: ovKind === 'extra' ? ovStart : (ovStart || null),
        end_time: ovKind === 'extra' ? ovEnd : (ovEnd || null),
      })
      if (!res.error) { setOvDate(''); setOvStart(''); setOvEnd('') }
      return res
    })

  const removeOverride = (id: string) =>
    run(async () => createClient().from('coach_availability_overrides').delete().eq('id', id))

  return (
    <div className={cn('rounded-2xl bg-white p-4 shadow-sm border border-gray-100 space-y-4', isRTL && 'rtl text-right')} data-testid="availability-editor">
      <div>
        <h3 className={cn('text-sm font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
        <p className="text-xs text-gray-500">{t('subtitle')}</p>
      </div>

      {/* Add a weekly window: day pills + range */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button key={d} type="button" data-testid="avail-day-pill" data-dow={d}
              onClick={() => setDay(d)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
                day === d ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-600')}>
              {dayLabel(d)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="time" data-testid="avail-start" value={start} onChange={(e) => setStart(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <span className="text-xs text-gray-400">→</span>
          <input type="time" data-testid="avail-end" value={end} onChange={(e) => setEnd(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <Button size="sm" data-testid="avail-add" disabled={busy} onClick={addWindow} className="bg-[#cd1419] hover:bg-[#a81014]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="me-1 h-4 w-4" />} {t('publish')}
          </Button>
        </div>
      </div>

      {/* Published windows */}
      {windows.length > 0 && (
        <ul className="space-y-1.5">
          {windows.map((w) => (
            <li key={w.id} data-testid="avail-row" data-dow={w.day_of_week}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
              <span className="text-gray-800">
                <span className="font-medium">{dayLabel(w.day_of_week)}</span>
                <span className="ms-2 text-xs text-gray-500" dir="ltr">{hhmm(w.start_time)}–{hhmm(w.end_time)}</span>
              </span>
              <button type="button" data-testid="avail-remove" disabled={busy} onClick={() => removeWindow(w.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Date overrides */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-medium text-gray-600">{t('overrides')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" data-testid="ov-date" value={ovDate} onChange={(e) => setOvDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <button type="button" data-testid="ov-kind-block" onClick={() => setOvKind('block')}
            className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
              ovKind === 'block' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500')}>
            <CalendarOff className="h-3 w-3" /> {t('block')}
          </button>
          <button type="button" data-testid="ov-kind-extra" onClick={() => setOvKind('extra')}
            className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
              ovKind === 'extra' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500')}>
            <CalendarPlus className="h-3 w-3" /> {t('extra')}
          </button>
          {ovKind === 'extra' && (
            <>
              <input type="time" data-testid="ov-start" value={ovStart} onChange={(e) => setOvStart(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
              <input type="time" data-testid="ov-end" value={ovEnd} onChange={(e) => setOvEnd(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            </>
          )}
          <Button size="sm" variant="outline" data-testid="ov-add" disabled={busy} onClick={addOverride}>
            <Plus className="me-1 h-3.5 w-3.5" /> {t('add')}
          </Button>
        </div>
        {overrides.length > 0 && (
          <ul className="space-y-1.5">
            {overrides.map((o) => (
              <li key={o.id} data-testid="ov-row" data-kind={o.kind}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                <span className={cn(o.kind === 'block' ? 'text-red-600' : 'text-green-700')} dir="ltr">
                  {o.date} · {o.kind === 'block' ? (o.start_time ? `${hhmm(o.start_time)}–${hhmm(o.end_time)}` : t('allDay')) : `${hhmm(o.start_time)}–${hhmm(o.end_time)}`}
                </span>
                <button type="button" disabled={busy} onClick={() => removeOverride(o.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
