'use client'

/**
 * Member-360 guardian panel (B3) — staff link/unlink guardians on a kid's file.
 * Origination A/B: SEARCH-BY-PHONE FIRST (the guardian may already be a member
 * or another kid's guardian — one profile, many hats), create only if new.
 * Writes ride the existing staff RLS (profiles/guardians/guardian_students are
 * staff-managed, gym-scoped). Unlink keeps history (invoices keep their payer).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { normalizePhone } from '@/lib/utils/phone'
import { PhoneDuplicateHint } from '@/components/shared/phone-duplicate-hint'
import { Loader2, Phone, Search, UserPlus, X, Users } from 'lucide-react'
// MJ-2×MJ-1 RECONCILE: LOOKUP = MJ-1's find_profile_by_phone RPC; WRITE = MY canonical shape.
import { findProfileByPhone } from '@/lib/provisioning/guardian-lookup'
import { InviteButton } from '@/components/shared/invite-button'

export type GuardianRow = {
  linkId: string
  guardianId: string
  profileId: string
  name: string
  phone: string | null
  relationship: string | null
}

export function GuardianPanel({
  studentId, gymId, guardians, locale,
}: {
  studentId: string
  gymId: string
  guardians: GuardianRow[]
  locale: string
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('family.staff')
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [searched, setSearched] = useState(false)
  const [match, setMatch] = useState<{ profileId: string; name: string } | null>(null)
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')

  // MJ-1 LOOKUP UNIFY: the same normalized exact-match helper the add-member wizard
  // uses (find_profile_by_phone, gym-scoped) — no more per-surface phone semantics.
  const search = async () => {
    setBusy(true); setError(''); setMatch(null)
    const supabase = createClient()
    const found = await findProfileByPhone(supabase, phone, locale)
    setSearched(true)
    if (found) setMatch({ profileId: found.profileId, name: found.name })
    setBusy(false)
  }

  // Ensure a guardians row for the profile, then link it to this student.
  const linkProfile = async (profileId: string) => {
    setBusy(true); setError('')
    try {
      const supabase = createClient()
      let { data: g } = await supabase.from('guardians').select('id').eq('profile_id', profileId).maybeSingle()
      if (!g) {
        const { data: created, error: gErr } = await supabase
          .from('guardians')
          .insert({ profile_id: profileId, gym_id: gymId, is_primary_contact: true })
          .select('id').single()
        if (gErr) throw gErr
        g = created
      }
      const { error: lErr } = await supabase
        .from('guardian_students')
        .insert({ guardian_id: g!.id, student_id: studentId })
      if (lErr && !`${lErr.message}`.includes('duplicate')) throw lErr
      setOpen(false); setPhone(''); setSearched(false); setMatch(null); setNewFirst(''); setNewLast('')
      router.refresh()
    } catch (e: any) {
      console.error('[guardian-panel]', e) // raw error: console only (ERROR-HARDEN)
      setError(t('linkFailed'))
    } finally {
      setBusy(false)
    }
  }

  const createAndLink = async () => {
    if (!newFirst.trim()) { setError(t('nameRequired')); return }
    setBusy(true); setError('')
    try {
      const supabase = createClient()
      const fn = newFirst.trim(); const lnm = newLast.trim()
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .insert({
          gym_id: gymId, phone: normalizePhone(phone) || null,
          first_name_en: fn, first_name_ar: fn, first_name_fr: fn,
          last_name_en: lnm, last_name_ar: lnm, last_name_fr: lnm,
        })
        .select('id').single()
      if (pErr) throw pErr
      await linkProfile(prof.id)
    } catch (e: any) {
      console.error('[guardian-panel]', e) // raw error: console only (ERROR-HARDEN)
      setError(t('linkFailed'))
      setBusy(false)
    }
  }

  const unlink = async (linkId: string) => {
    setBusy(true); setError('')
    const supabase = createClient()
    const { error: dErr } = await supabase.from('guardian_students').delete().eq('id', linkId)
    setBusy(false)
    if (dErr) setError(dErr.message)
    else router.refresh()
  }

  return (
    <section id="panel-guardians" className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="panel-guardians">
      <div className="mb-3 flex items-center justify-between">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Users className="h-4 w-4 text-primary-600" /> {t('guardians')}
        </h2>
        <Button size="sm" variant="outline" data-testid="guardian-link-btn" onClick={() => setOpen((v) => !v)}>
          <UserPlus className="me-1 h-3.5 w-3.5" /> {t('linkGuardian')}
        </Button>
      </div>

      {guardians.length === 0 ? (
        <p className="py-2 text-center text-sm text-gray-400" data-testid="no-guardian-hint">{t('noGuardian')}</p>
      ) : (
        <ul className="space-y-2">
          {guardians.map((g) => (
            <li key={g.linkId} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="guardian-row">
              <div>
                <p className="font-medium text-gray-800">{g.name}{g.relationship ? ` (${g.relationship})` : ''}</p>
                {g.phone && (
                  <a href={`tel:${g.phone}`} dir="ltr" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
                    <Phone className="h-3 w-3" /> {g.phone}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1" data-testid="guardian-row-actions">
                {/* MJ-1: give the guardian their own portal login (role 'parent'). The
                    guardian is the family's door — this is the one credential the household needs. */}
                <InviteButton kind="parent" id={g.profileId} name={g.name} locale={locale} phone={g.phone} />
                <Button size="sm" variant="ghost" data-testid="guardian-unlink-btn" disabled={busy}
                  className="text-red-500 hover:bg-red-50" onClick={() => unlink(g.linkId)}>
                  <X className="h-3.5 w-3.5" /> {t('unlink')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 space-y-2 rounded-xl border bg-gray-50 p-3">
          {error && <p data-testid="guardian-error" className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
          <div className="flex items-center gap-2">
            <Input data-testid="guardian-phone-input" dir="ltr" placeholder="+961…" value={phone}
              onChange={(e) => { setPhone(e.target.value); setSearched(false); setMatch(null) }} className="h-9" />
            <Button size="sm" data-testid="guardian-search-btn" disabled={busy || !phone.trim()} onClick={search}
              className="bg-primary-700 hover:bg-primary-800">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="me-1 h-3.5 w-3.5" />} {t('search')}
            </Button>
          </div>
          <PhoneDuplicateHint gymId={gymId} phone={phone} locale={locale} />
          {searched && match && (
            <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm" data-testid="guardian-match">
              <span className="font-medium text-gray-800">{match.name}</span>
              <Button size="sm" data-testid="guardian-link-existing" disabled={busy} onClick={() => linkProfile(match.profileId)}
                className="bg-green-600 hover:bg-green-700">{t('linkThis')}</Button>
            </div>
          )}
          {searched && !match && (
            <div className="space-y-2" data-testid="guardian-create-box">
              <p className="text-xs text-gray-500">{t('noMatch')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input data-testid="guardian-new-first" placeholder={t('firstName')} value={newFirst}
                  onChange={(e) => setNewFirst(e.target.value)} className="h-9 w-36" />
                <Input data-testid="guardian-new-last" placeholder={t('lastName')} value={newLast}
                  onChange={(e) => setNewLast(e.target.value)} className="h-9 w-36" />
                <Button size="sm" data-testid="guardian-create-link" disabled={busy} onClick={createAndLink}
                  className="bg-green-600 hover:bg-green-700">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('createAndLink')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
