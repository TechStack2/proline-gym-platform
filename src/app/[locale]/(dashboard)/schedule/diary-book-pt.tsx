'use client'

/**
 * Diary "Book PT" (PT-2) — the staff picker from the coach column: pick one
 * of the coach's active assignments (member chips), then the SAME shared
 * BookPtModal (staff variant: slots + override + conflict warning).
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { BookPtModal } from '@/components/shared/book-pt-modal'
import { CalendarPlus } from 'lucide-react'

export type DiaryAssignment = { id: string; studentName: string; remaining: number }

export function DiaryBookPt({ assignments, locale }: { assignments: DiaryAssignment[]; locale: string }) {
  const t = useTranslations('ptBooking')
  const [picked, setPicked] = useState('')
  const [open, setOpen] = useState(false)

  if (assignments.length === 0) return null

  return (
    <div className="mt-2 border-t pt-2">
      {!open ? (
        <button type="button" data-testid="diary-book-pt" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-[#cd1419] hover:text-[#cd1419]">
          <CalendarPlus className="h-3 w-3" /> {t('book')}
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {assignments.map((a) => (
              <button key={a.id} type="button" data-testid="diary-pt-member-chip"
                onClick={() => setPicked(a.id)}
                className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  picked === a.id ? 'border-[#cd1419] bg-red-50 text-[#cd1419]' : 'border-gray-200 text-gray-600')}>
                {a.studentName} · {a.remaining}
              </button>
            ))}
          </div>
          {picked && <BookPtModal assignmentId={picked} locale={locale} staff triggerTestid="diary-pt-book-open" />}
        </div>
      )}
    </div>
  )
}
