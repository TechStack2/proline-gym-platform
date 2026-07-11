'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { approveRegistration, rejectRegistration, cancelRegistration, registerWalkIn } from './registration-actions'
import { useErrorText } from '@/lib/errors/use-error-text';

type Reg = {
  id: string; status: string; waitlist_position: number | null
  monthly_fee_usd: number | null; invoice_id: string | null; studentName: string
}

/**
 * Staff registrations panel (B2 · T2/T4). Approve(+discount) → active+invoice OR
 * waitlisted; reject; cancel (→ auto-promote next); register a walk-in member.
 * The atomic capacity/waitlist logic lives in the RPCs; this only collects input.
 */
export function RegistrationsPanel({
  classId, registrations, students, locale,
}: {
  classId: string
  registrations: Reg[]
  students: { id: string; name: string }[]
  locale: string
}) {
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const router = useRouter()
  const errText = useErrorText();
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [discount, setDiscount] = useState<Record<string, string>>({})
  const [walkInStudent, setWalkInStudent] = useState('')

  const requested = registrations.filter((r) => r.status === 'requested')
  const active = registrations.filter((r) => r.status === 'active')
  const waitlisted = registrations.filter((r) => r.status === 'waitlisted')
    .sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0))

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setError(errText(res.error)); return }
      router.refresh()
    })
  }

  return (
    <Card data-testid="registrations-panel">
      <CardHeader><CardTitle>{t('Registrations', 'التسجيلات', 'Inscriptions')}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {error && <div data-testid="reg-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {/* Walk-in register */}
        <div className="flex flex-wrap items-end gap-2 border-b pb-4">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-muted-foreground">{t('Register a member (walk-in)', 'تسجيل عضو (مباشر)', 'Inscrire un membre (sur place)')}</label>
            <select data-testid="walkin-student" value={walkInStudent} onChange={(e) => setWalkInStudent(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{t('Select a member…', 'اختر عضواً…', 'Sélectionner un membre…')}</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Button data-testid="walkin-register-btn" disabled={pending || !walkInStudent}
            onClick={() => run(() => registerWalkIn(classId, walkInStudent))}>
            {t('Register', 'تسجيل', 'Inscrire')}
          </Button>
        </div>

        {/* Pending requests */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Pending requests', 'طلبات معلّقة', 'Demandes en attente')} ({requested.length})</h3>
          {requested.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('No pending requests.', 'لا طلبات معلّقة.', 'Aucune demande en attente.')}</p>
          ) : (
            <div className="space-y-2">
              {requested.map((r) => (
                <div key={r.id} data-testid="reg-row" data-status="requested" data-reg-id={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium" data-testid="reg-student">{r.studentName}</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="100" placeholder={t('disc %', 'خصم %', 'remise %')} data-testid="discount-pct"
                      className="h-8 w-20 text-xs" value={discount[r.id] ?? ''} onChange={(e) => setDiscount({ ...discount, [r.id]: e.target.value })} />
                    <Button size="sm" data-testid="approve-btn" disabled={pending}
                      onClick={() => run(() => approveRegistration({ regId: r.id, classId, discountPct: discount[r.id] ? parseFloat(discount[r.id]) : 0 }))}
                      className="bg-primary-700 hover:bg-primary-800">{t('Approve', 'موافقة', 'Approuver')}</Button>
                    <Button size="sm" variant="outline" data-testid="reject-btn" disabled={pending}
                      onClick={() => run(() => rejectRegistration(r.id, classId, undefined))}>{t('Reject', 'رفض', 'Refuser')}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Active', 'النشطون', 'Actifs')} ({active.length})</h3>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('No active registrations.', 'لا تسجيلات نشطة.', 'Aucune inscription active.')}</p>
          ) : (
            <div className="space-y-2" data-testid="active-list">
              {active.map((r) => (
                <div key={r.id} data-testid="reg-row" data-status="active" data-reg-id={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium" data-testid="reg-student">{r.studentName}</span>
                  <div className="flex items-center gap-2">
                    {r.invoice_id && <Badge className="bg-green-100 text-green-700">{t('Invoiced', 'مفوترة', 'Facturé')}</Badge>}
                    <Button size="sm" variant="outline" data-testid="cancel-reg-btn" disabled={pending}
                      onClick={() => run(() => cancelRegistration(r.id, classId))}>{t('Cancel', 'إلغاء', 'Annuler')}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Waitlist */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Waitlist', 'قائمة الانتظار', "Liste d'attente")} ({waitlisted.length})</h3>
          {waitlisted.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Waitlist is empty.', 'قائمة الانتظار فارغة.', "La liste d'attente est vide.")}</p>
          ) : (
            <div className="space-y-2" data-testid="waitlist">
              {waitlisted.map((r) => (
                <div key={r.id} data-testid="reg-row" data-status="waitlisted" data-reg-id={r.id} data-position={r.waitlist_position ?? ''}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium" data-testid="reg-student">#{r.waitlist_position} · {r.studentName}</span>
                  <Button size="sm" variant="outline" data-testid="cancel-reg-btn" disabled={pending}
                    onClick={() => run(() => cancelRegistration(r.id, classId))}>{t('Cancel', 'إلغاء', 'Annuler')}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
