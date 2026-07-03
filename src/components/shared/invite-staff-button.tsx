'use client'

/**
 * STAFF-INVITE — the in-app way to create reception / head-coach (and coach)
 * logins. Lives on the team (/coaches) page, owner/head_coach-gated (the page
 * gates render; inviteToPortal re-gates server-side). Flow:
 *   name + phone + role → create the login-less profile (caller-RLS insert, the
 *   add-coach write path) → inviteToPortal({ profileId, role }) → the shared
 *   credential card (phone login + login URL + temp password + wa.me share).
 * Coach/head-coach also get a coaches row (rosters + the coach app resolve it);
 * a receptionist is profile-only. The phone is REQUIRED by the form (an invite
 * without a phone is a dead-end — the no_phone UX guard).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { UserPlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteToPortal } from '@/lib/provisioning/invite'
import { InviteResultCard, type InviteResult } from './invite-button'

type StaffRole = 'receptionist' | 'head_coach' | 'coach'
const ROLES: StaffRole[] = ['receptionist', 'head_coach', 'coach']

export function InviteStaffButton({ locale, gymId }: { locale: string; gymId: string }) {
  const t = useTranslations('invite')
  const isRTL = locale === 'ar'
  const supabase = createClient()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StaffRole>('receptionist')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<InviteResult | null>(null)

  const valid = firstName.trim().length > 0 && phone.trim().length >= 6

  const submit = async () => {
    setBusy(true); setError('')
    try {
      // 1. The login-less profile (caller-RLS insert — the add-coach write path).
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .insert({
          gym_id: gymId,
          first_name_en: firstName.trim(), first_name_ar: firstName.trim(), first_name_fr: firstName.trim(),
          last_name_en: lastName.trim() || null, last_name_ar: lastName.trim() || null, last_name_fr: lastName.trim() || null,
          phone: phone.trim(),
        })
        .select('id')
        .single()
      if (pErr || !prof) { setError(pErr?.message || 'profile'); setBusy(false); return }

      // 2. Coaching staff also need a coaches row (rosters / the coach app).
      if (role !== 'receptionist') {
        const { error: cErr } = await supabase
          .from('coaches')
          .insert({ profile_id: prof.id, gym_id: gymId, is_active: true })
        if (cErr) { setError(cErr.message); setBusy(false); return }
      }

      // 3. Invite with the chosen role → the shared credential card.
      const res = await inviteToPortal({ profileId: prof.id, role })
      setBusy(false)
      if (res.ok) {
        setResult({ tempPassword: res.tempPassword, login: res.login, waPhone: res.waPhone })
        router.refresh() // the new staff member appears on the roster behind the card
      } else {
        setError(t(`err.${res.error}` as Parameters<typeof t>[0]) || res.error)
      }
    } catch (e) {
      setBusy(false)
      setError((e as Error).message)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" data-testid="invite-staff-btn" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1 h-4 w-4" /> {t('inviteStaff')}
      </Button>
    )
  }

  return (
    <div className={cn('w-full max-w-md rounded-2xl border border-gray-100 bg-white p-4 shadow-sm', isRTL && 'text-right')}
      data-testid="invite-staff-form">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <UserPlus className="h-4 w-4 text-primary-600" /> {t('inviteStaff')}
        </p>
        <button type="button" aria-label="close" onClick={() => { setOpen(false); setResult(null) }}
          className="rounded p-1 text-gray-400 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {result ? (
        <InviteResultCard result={result} locale={locale} />
      ) : (
        <div className="space-y-2">
          <Input data-testid="staff-first-name" placeholder={t('firstName')} value={firstName}
            onChange={(e) => setFirstName(e.target.value)} />
          <Input data-testid="staff-last-name" placeholder={t('lastName')} value={lastName}
            onChange={(e) => setLastName(e.target.value)} />
          {/* Phone is REQUIRED — it IS the login (and the wa.me share target). */}
          <Input data-testid="staff-phone" placeholder={t('phoneRequired')} value={phone}
            onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" />
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <button key={r} type="button" data-testid="staff-role" data-value={r}
                onClick={() => setRole(r)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                  role === r ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                {t(`role.${r}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
          <Button data-testid="staff-invite-submit" disabled={!valid || busy} onClick={submit} className="w-full">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
            {t('invite')}
          </Button>
          {error && <p className="text-xs text-red-600" data-testid="invite-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
