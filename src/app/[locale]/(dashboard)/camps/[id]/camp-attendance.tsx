'use client'

/**
 * Per-day camp attendance (E1): day pills across the camp range; present/
 * absent per confirmed kid — UPSERT on camp_attendance's natural key
 * (camp_id, student_id, attendance_date), gym-scoped staff RLS (000043).
 */
import { fmtDate } from '@/lib/fmt'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { Check, X } from 'lucide-react'

export function CampAttendance({ campId, day, days, kids, locale }: {
  campId: string
  day: string
  days: string[]
  kids: { studentId: string; name: string; status: string | null }[]
  locale: string
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('camps')
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState<string | null>(null)

  const mark = async (studentId: string, status: 'present' | 'absent') => {
    setBusy(studentId)
    const { error } = await createClient()
      .from('camp_attendance')
      .upsert(
        { camp_id: campId, student_id: studentId, attendance_date: day, status },
        { onConflict: 'camp_id,student_id,attendance_date' },
      )
    setBusy(null)
    if (error) { console.error('[camp-attendance]', error); toast({ title: t('markFailed'), variant: 'destructive' }) } // ERROR-HARDEN
    else router.refresh()
  }

  const fmtPill = (d: string) => fmtDate(d, locale, 'weekday')

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="camp-attendance">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {days.map((d) => (
          <Link key={d} href={`${pathname}?tab=attendance&date=${d}`} data-testid="camp-day-pill" data-date={d}
            className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
              d === day ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}>
            {fmtPill(d)}
          </Link>
        ))}
      </div>
      {kids.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{t('noRegs')}</p>
      ) : (
        <ul className="divide-y">
          {kids.map((k) => (
            <li key={k.studentId} className="flex items-center justify-between gap-2 py-2.5"
              data-testid="camp-att-row" data-att-status={k.status ?? ''}>
              <span className="text-sm font-medium text-gray-900">{k.name}</span>
              <span className="flex items-center gap-1.5">
                <button type="button" data-testid="camp-att-present" disabled={busy !== null}
                  onClick={() => mark(k.studentId, 'present')}
                  className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium',
                    /* W3a §2.3/DA-25 pattern: active states wear the role TINTS. */
                    k.status === 'present' ? 'tint-success border border-success-500/40' : 'border text-gray-600 hover:bg-success-500/10')}>
                  <Check className="h-3.5 w-3.5" /> {t('present')}
                </button>
                <button type="button" data-testid="camp-att-absent" disabled={busy !== null}
                  onClick={() => mark(k.studentId, 'absent')}
                  className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium',
                    k.status === 'absent' ? 'tint-danger border border-danger-500/40' : 'border text-gray-600 hover:bg-danger-500/10')}>
                  <X className="h-3.5 w-3.5" /> {t('absent')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
