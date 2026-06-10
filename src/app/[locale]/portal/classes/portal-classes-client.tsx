'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, DollarSign, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { requestClassRegistration, cancelMyRegistration } from './actions'

const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']

type Reg = { id: string; status: string; waitlist_position: number | null }
type ClassItem = {
  id: string; name: string; coachName: string
  monthly_fee_usd: number | null; monthly_fee_lbp: number | null
  schedules: { day_of_week: number; start_time: string; end_time: string }[]
  registration: Reg | null
}

export function PortalClassesClient({ classes, locale, hasStudent }: { classes: ClassItem[]; locale: string; hasStudent: boolean }) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string) => (isRTL ? ar : en)
  const DAYS = isRTL ? DAYS_AR : DAYS_EN
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function statusLabel(r: Reg): string {
    if (r.status === 'active') return t('Active', 'نشط')
    if (r.status === 'requested') return t('Requested', 'بانتظار الموافقة')
    if (r.status === 'waitlisted') return t(`Waitlist #${r.waitlist_position ?? ''}`, `قائمة الانتظار #${r.waitlist_position ?? ''}`)
    return r.status
  }
  const statusStyle: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    requested: 'bg-yellow-100 text-yellow-700',
    waitlisted: 'bg-orange-100 text-orange-700',
  }

  function request(classId: string) {
    setError(''); setBusyId(classId)
    startTransition(async () => {
      const res = await requestClassRegistration(classId)
      setBusyId(null)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }
  function cancel(regId: string, classId: string) {
    if (!window.confirm(t('Cancel this registration?', 'إلغاء هذا التسجيل؟'))) return
    setError(''); setBusyId(classId)
    startTransition(async () => {
      const res = await cancelMyRegistration(regId)
      setBusyId(null)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  if (classes.length === 0) {
    return <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-400 shadow-sm">{t('No classes available.', 'لا توجد حصص متاحة.')}</div>
  }

  return (
    <div className="space-y-3">
      {error && <div data-testid="portal-class-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {classes.map((c) => {
        const reg = c.registration
        const busy = busyId === c.id && pending
        return (
          <div key={c.id} data-testid="portal-class-card" data-class-id={c.id}
            className={cn('rounded-2xl bg-white p-4 shadow-sm', isRTL && 'text-right')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{c.name}</p>
                {c.coachName && <p className="text-xs text-gray-500">{c.coachName}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {c.schedules.slice(0, 3).map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{DAYS[s.day_of_week]}
                      <Clock className="h-3 w-3" />{s.start_time?.slice(0, 5)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                {c.monthly_fee_usd != null && (
                  <p className="inline-flex items-center gap-0.5 text-sm font-bold text-gray-900">
                    <DollarSign className="h-3.5 w-3.5" />{Number(c.monthly_fee_usd).toFixed(2)}
                    <span className="text-xs font-normal text-gray-400">/{t('mo', 'شهر')}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              {reg ? (
                <>
                  <span data-testid="reg-status" data-status={reg.status}
                    className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', statusStyle[reg.status] || 'bg-gray-100 text-gray-600')}>
                    {statusLabel(reg)}
                  </span>
                  <button data-testid="cancel-reg-btn" disabled={busy} onClick={() => cancel(reg.id, c.id)}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('Cancel', 'إلغاء')}
                  </button>
                </>
              ) : (
                <button data-testid="request-btn" disabled={busy || !hasStudent} onClick={() => request(c.id)}
                  className="rounded-md bg-[#cd1419] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#a81014] disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('Request', 'تسجيل')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
