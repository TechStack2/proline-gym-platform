'use client'

/**
 * Add-member wizard (UX-2). Two paths off ONE mode switch (solo is the default,
 * so every existing flow is byte-unchanged):
 *
 *  · SOLO — identity → guardian (minors, skippable) → plan (optional) → review.
 *    The F1 create_student identity RPC; guardian linking is the B3 search-by-
 *    phone-first flow; optional membership rides the staff RLS.
 *
 *  · FAMILY (MJ-1 guardian-first, mirrors the desk conversation) —
 *    guardian (name + phone ONCE, exact-match lookup) → kids (phone-free; the
 *    household contact + emergency ride the guardian; DOB drives the login-
 *    eligibility default) → "parent training too?" dual-hat → review + an optional
 *    one-tap "send portal access to the guardian". Reuses create_student per kid,
 *    attach_student_to_profile for the dual-hat, and the shared guardian/link writes.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { normalizePhone } from '@/lib/utils/phone'
import { PhoneDuplicateHint } from '@/components/shared/phone-duplicate-hint'
import { toast } from '@/components/ui/use-toast'
import { FormWizard, ChipRow } from '@/components/shared/form-wizard'
import { ModalPortal } from '@/components/shared/modal-portal'
import { Search, Plus, X } from 'lucide-react'
// MJ-2×MJ-1 RECONCILE: LOOKUP is MJ-1's gym-scoped find_profile_by_phone RPC; WRITE
// stores MY canonical normalizePhone shape; the dup-hint chip complements the flow.
import { findProfileByPhone } from '@/lib/provisioning/guardian-lookup'
import { inviteToPortal } from '@/lib/provisioning/invite'
import { InviteResultCard, type InviteResult } from '@/components/shared/invite-button'

type Plan = { id: string; name: string; price: number; durationDays: number }
type Kid = { nameEn: string; nameAr: string; dob: string; gender: 'male' | 'female'; planId: string }
const emptyKid = (): Kid => ({ nameEn: '', nameAr: '', dob: '', gender: 'male', planId: '' })

// INTAKE-FOCUS: the labelled-field wrapper lives at MODULE SCOPE (stable type ref) so
// React never remounts the <Input> children mid-keystroke (cursor-jump bug).
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function AddStudentWizard({ gymId, plans, locale, membershipEnabled = true }: {
  gymId: string
  plans: Plan[]
  locale: string
  // NO-MEMBERSHIP: omit the (optional) Plan step on gyms that don't sell membership.
  membershipEnabled?: boolean
}) {
  const t = useTranslations('studentWizard')
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)

  // MJ-1: solo is the default → existing specs/flows unchanged.
  const [mode, setMode] = useState<'solo' | 'family'>('solo')

  // ── SOLO ──
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [gPhone, setGPhone] = useState('')
  const [gFound, setGFound] = useState<{ profileId: string; name: string } | null>(null)
  const [gSearched, setGSearched] = useState(false)
  const [gName, setGName] = useState('')
  const [gSkip, setGSkip] = useState(false)
  const [planId, setPlanId] = useState('')

  // ── FAMILY ──
  const [fgPhone, setFgPhone] = useState('')
  const [fgName, setFgName] = useState('')
  const [fgFound, setFgFound] = useState<{ profileId: string; name: string; kidCount: number } | null>(null)
  const [fgSearched, setFgSearched] = useState(false)
  const [kids, setKids] = useState<Kid[]>([emptyKid()])
  const [parentTrains, setParentTrains] = useState(false)
  const [parentPlanId, setParentPlanId] = useState('')
  const [sendInvite, setSendInvite] = useState(false)
  // Post-submit credential card (when "send portal access" ran the parent invite).
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [doneHref, setDoneHref] = useState('')

  const isMinor = useMemo(() => {
    if (!dob) return false
    return (Date.now() - new Date(dob).getTime()) / (365.25 * 864e5) < 18
  }, [dob])

  // ── shared helpers ──
  const insertMembership = async (studentId: string, pid: string) => {
    const plan = plans.find((p) => p.id === pid)
    if (!plan) return
    const end = new Date(Date.now() + plan.durationDays * 864e5).toISOString().slice(0, 10)
    const { error } = await supabase.from('student_memberships').insert({
      student_id: studentId, plan_id: pid,
      start_date: new Date().toISOString().slice(0, 10), end_date: end, status: 'active',
    })
    if (error) throw error
  }

  // MJ-1 LOOKUP UNIFY: the shared normalized exact-match (was an ilike '%phone%' fuzzy).
  const searchGuardian = async () => {
    setGSearched(true); setGFound(null)
    if (!gPhone.trim()) return
    const found = await findProfileByPhone(supabase, gPhone, locale)
    if (found) setGFound({ profileId: found.profileId, name: found.name })
  }

  const searchFamilyGuardian = async () => {
    setFgSearched(true); setFgFound(null)
    if (!fgPhone.trim()) return
    const found = await findProfileByPhone(supabase, fgPhone, locale)
    if (!found) return
    // Existing guardian → surface how many children already ride this identity.
    const { data: g } = await supabase.from('guardians').select('id').eq('profile_id', found.profileId).maybeSingle()
    let kidCount = 0
    if (g) {
      const { count } = await supabase.from('guardian_students').select('id', { count: 'exact', head: true }).eq('guardian_id', g.id)
      kidCount = count ?? 0
    }
    setFgFound({ profileId: found.profileId, name: found.name, kidCount })
  }

  // Ensure a guardians row for a profile; returns the guardians.id.
  const ensureGuardian = async (profileId: string): Promise<string> => {
    let { data: g } = await supabase.from('guardians').select('id').eq('profile_id', profileId).maybeSingle()
    if (!g) {
      const { data: ng, error } = await supabase
        .from('guardians').insert({ profile_id: profileId, gym_id: gymId, is_primary_contact: true }).select('id').single()
      if (error) throw error
      g = ng
    }
    return g!.id
  }

  const kidsValid = kids.some((k) => k.nameEn.trim() !== '')
  const updateKid = (i: number, patch: Partial<Kid>) => setKids((ks) => ks.map((k, idx) => (idx === i ? { ...k, ...patch } : k)))

  // ── SOLO submit (unchanged write path) ──
  const submitSolo = async () => {
    setBusy(true)
    try {
      const { data: student, error } = await supabase.rpc('create_student', {
        p_first_name_ar: nameAr || nameEn, p_first_name_en: nameEn, p_first_name_fr: nameEn,
        p_last_name_ar: '', p_last_name_en: '', p_last_name_fr: '',
        p_phone: normalizePhone(phone), p_gender: gender, p_date_of_birth: dob || null,
        p_emergency_contact_name: null, p_emergency_contact_phone: null,
        p_medical_notes: null, p_join_date: null, p_current_belt_rank: null,
      })
      if (error) throw error
      const studentId = (student as any)?.id

      if (isMinor && !gSkip && studentId) {
        let profileId = gFound?.profileId ?? null
        if (!profileId && gName.trim() && gPhone.trim()) {
          const { data: prof, error: pErr } = await supabase
            .from('profiles')
            .insert({
              gym_id: gymId, phone: normalizePhone(gPhone),
              first_name_ar: gName.trim(), first_name_en: gName.trim(), first_name_fr: gName.trim(),
              last_name_ar: '', last_name_en: '', last_name_fr: '',
            })
            .select('id').single()
          if (pErr) throw pErr
          profileId = prof.id
        }
        if (profileId) {
          const guardianId = await ensureGuardian(profileId)
          const { error: lErr } = await supabase.from('guardian_students').insert({ guardian_id: guardianId, student_id: studentId })
          if (lErr) throw lErr
        }
      }

      if (planId && studentId) await insertMembership(studentId, planId)

      toast({ title: t('created'), variant: 'success' })
      router.push(`/${locale}/students/${studentId ?? ''}`)
      router.refresh()
    } catch (err: any) {
      toast({ title: t('failed'), description: err.message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  // ── FAMILY submit (guardian-first) ──
  const submitFamily = async () => {
    setBusy(true)
    try {
      // 1) Resolve/create the guardian ONCE (never re-create an existing identity).
      let guardianProfileId = fgFound?.profileId ?? null
      if (!guardianProfileId) {
        const { data: prof, error } = await supabase
          .from('profiles')
          .insert({
            gym_id: gymId, phone: normalizePhone(fgPhone) || null,
            first_name_ar: fgName.trim(), first_name_en: fgName.trim(), first_name_fr: fgName.trim(),
            last_name_ar: '', last_name_en: '', last_name_fr: '',
          })
          .select('id').single()
        if (error) throw error
        guardianProfileId = prof.id
      }
      if (!guardianProfileId) throw new Error('guardian_unresolved')
      const guardianId = await ensureGuardian(guardianProfileId)
      const guardianName = fgFound?.name ?? fgName.trim()
      const guardianPhone = normalizePhone(fgPhone) || null

      let firstStudentId = ''
      // 2) Each kid — PHONE-FREE; the household contact + emergency ride the guardian.
      for (const kid of kids) {
        if (!kid.nameEn.trim()) continue
        const { data: st, error } = await supabase.rpc('create_student', {
          p_first_name_ar: kid.nameAr || kid.nameEn, p_first_name_en: kid.nameEn, p_first_name_fr: kid.nameEn,
          p_last_name_ar: '', p_last_name_en: '', p_last_name_fr: '',
          p_phone: null, p_gender: kid.gender, p_date_of_birth: kid.dob || null,
          p_emergency_contact_name: guardianName, p_emergency_contact_phone: guardianPhone,
          p_medical_notes: null, p_join_date: null, p_current_belt_rank: null,
        })
        if (error) throw error
        const sid = (st as any)?.id
        if (!firstStudentId) firstStudentId = sid
        const { error: lErr } = await supabase.from('guardian_students').insert({ guardian_id: guardianId, student_id: sid })
        if (lErr) throw lErr
        if (kid.planId) await insertMembership(sid, kid.planId)
      }

      // 3) DUAL-HAT — the guardian trains too: the SAME profile gets a student row.
      if (parentTrains) {
        const { data: pst, error } = await supabase.rpc('attach_student_to_profile', { p_profile_id: guardianProfileId })
        if (error) throw error
        const psid = (pst as any)?.id
        if (!firstStudentId) firstStudentId = psid
        if (parentPlanId && psid) await insertMembership(psid, parentPlanId)
      }

      const href = `/${locale}/students/${firstStudentId}`

      // 4) Optional one-tap portal access for the guardian (skippable).
      if (sendInvite) {
        const res = await inviteToPortal({ profileId: guardianProfileId, role: 'parent' })
        if (res.ok) {
          // Show the share-once credential card, then navigate on "done".
          setOpen(false)
          setDoneHref(href)
          setInviteResult({ tempPassword: res.tempPassword, login: res.login, waPhone: res.waPhone, gymName: res.gymName })
          setBusy(false)
          return
        }
        toast({ title: t('family.inviteFailed'), variant: 'destructive' })
      }

      toast({ title: t('family.created'), variant: 'success' })
      router.push(href)
      router.refresh()
    } catch (err: any) {
      toast({ title: t('failed'), description: err.message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  // ── mode switch (top of step 0 in both paths) ──
  const modeChips = (
    <div className="mb-3 flex gap-1.5" data-testid="sw-mode" data-mode={mode}>
      {(['solo', 'family'] as const).map((m) => (
        <button key={m} type="button" data-testid={`sw-mode-${m}`} data-active={mode === m} onClick={() => setMode(m)}
          className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
            mode === m ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
          {t(m === 'solo' ? 'modeSolo' : 'modeFamily')}
        </button>
      ))}
    </div>
  )

  const planChips = (value: string, onPick: (id: string) => void, testid: string) => (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" data-testid={`${testid}-none`} onClick={() => onPick('')}
        className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
          value === '' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600')}>
        {t('noPlan')}
      </button>
      {plans.map((p) => (
        <button key={p.id} type="button" data-testid={testid} data-id={p.id} onClick={() => onPick(p.id)}
          className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
            value === p.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700')}>
          {p.name} · ${p.price.toFixed(0)}
        </button>
      ))}
    </div>
  )

  // ── SOLO steps (identity → guardian? → plan? → review) ──
  const soloSteps = [
    {
      key: 'identity',
      title: t('identity'),
      valid: nameEn.trim() !== '' && phone.trim() !== '',
      content: (
        <div className="space-y-3">
          {modeChips}
          <F label={t('nameEn')}><Input data-testid="sw-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></F>
          <F label={t('nameAr')}><Input dir="rtl" data-testid="sw-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></F>
          <F label={t('phone')}>
            <Input dir="ltr" type="tel" data-testid="sw-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961…" />
            <PhoneDuplicateHint gymId={gymId} phone={phone} locale={locale} />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label={t('dob')}><Input type="date" data-testid="sw-dob" value={dob} onChange={(e) => setDob(e.target.value)} /></F>
            <F label={t('gender')}>
              <ChipRow testid="sw-gender"
                options={[{ value: 'male', label: t('male') }, { value: 'female', label: t('female') }]}
                value={gender} onChange={(v) => setGender(v)} />
            </F>
          </div>
        </div>
      ),
    },
    ...(isMinor ? [{
      key: 'guardian',
      title: t('guardian'),
      valid: gSkip || !!gFound || (gName.trim() !== '' && gPhone.trim() !== '') || gPhone.trim() === '',
      content: (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{t('guardianHint')}</p>
          <div className="flex items-center gap-2">
            <Input dir="ltr" type="tel" data-testid="sw-guardian-phone" value={gPhone}
              onChange={(e) => { setGPhone(e.target.value); setGSearched(false) }} placeholder="+961…" className="flex-1" />
            <Button size="sm" variant="outline" data-testid="sw-guardian-search" onClick={() => void searchGuardian()}>
              <Search className="me-1 h-3.5 w-3.5" /> {t('search')}
            </Button>
          </div>
          {gFound && (
            <p data-testid="sw-guardian-found" className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              {t('found', { name: gFound.name })}
            </p>
          )}
          {gSearched && !gFound && (
            <F label={t('guardianName')}>
              <Input data-testid="sw-guardian-name" value={gName} onChange={(e) => setGName(e.target.value)} placeholder={t('guardianNamePh')} />
            </F>
          )}
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" data-testid="sw-guardian-skip" checked={gSkip} onChange={(e) => setGSkip(e.target.checked)} className="h-4 w-4 accent-primary-700" />
            {t('skipGuardian')}
          </label>
        </div>
      ),
    }] : []),
    ...(membershipEnabled ? [{
      key: 'plan',
      title: t('plan'),
      content: (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('planHint')}</p>
          {planChips(planId, setPlanId, 'sw-plan-chip')}
        </div>
      ),
    }] : []),
    {
      key: 'review',
      title: t('review'),
      content: (
        <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700" data-testid="sw-review">
          <p className="font-semibold text-gray-900">{nameEn}{nameAr ? ` · ${nameAr}` : ''}</p>
          <p dir="ltr">{phone}</p>
          {dob && <p>{t('dob')}: {dob}{isMinor ? ` · ${t('minor')}` : ''}</p>}
          {isMinor && !gSkip && (gFound || gName) && <p>{t('guardian')}: {gFound?.name ?? gName}</p>}
          {planId && <p>{t('plan')}: {plans.find((p) => p.id === planId)?.name}</p>}
        </div>
      ),
    },
  ]

  // ── FAMILY steps (guardian → kids → dual-hat → review) ──
  const familySteps = [
    {
      key: 'guardian-first',
      title: t('family.guardian'),
      valid: !!fgFound || (fgName.trim() !== '' && fgPhone.trim() !== ''),
      content: (
        <div className="space-y-3">
          {modeChips}
          <p className="text-xs text-gray-500">{t('family.guardianHint')}</p>
          <div className="flex items-center gap-2">
            <Input dir="ltr" type="tel" data-testid="fam-guardian-phone" value={fgPhone}
              onChange={(e) => { setFgPhone(e.target.value); setFgSearched(false); setFgFound(null) }} placeholder="+961…" className="flex-1" />
            <Button size="sm" variant="outline" data-testid="fam-guardian-search" onClick={() => void searchFamilyGuardian()}>
              <Search className="me-1 h-3.5 w-3.5" /> {t('search')}
            </Button>
          </div>
          <PhoneDuplicateHint gymId={gymId} phone={fgPhone} locale={locale} />
          {fgFound && (
            <p data-testid="fam-guardian-found" className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              {t('family.foundGuardian', { name: fgFound.name, count: fgFound.kidCount })}
            </p>
          )}
          {fgSearched && !fgFound && (
            <F label={t('family.guardianName')}>
              <Input data-testid="fam-guardian-name" value={fgName} onChange={(e) => setFgName(e.target.value)} placeholder={t('family.guardianNamePh')} />
            </F>
          )}
        </div>
      ),
    },
    {
      key: 'kids',
      title: t('family.kids'),
      valid: kidsValid,
      content: (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{t('family.kidsHint')}</p>
          {kids.map((kid, i) => (
            <div key={i} data-testid="fam-kid" data-index={i} className="space-y-2 rounded-xl border bg-gray-50/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{t('family.kidN', { n: i + 1 })}</span>
                {kids.length > 1 && (
                  <button type="button" data-testid="fam-remove-kid" onClick={() => setKids((ks) => ks.filter((_, idx) => idx !== i))}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                    <X className="h-3.5 w-3.5" /> {t('family.removeKid')}
                  </button>
                )}
              </div>
              <F label={t('nameEn')}><Input data-testid="fam-kid-name-en" value={kid.nameEn} onChange={(e) => updateKid(i, { nameEn: e.target.value })} /></F>
              <F label={t('nameAr')}><Input dir="rtl" data-testid="fam-kid-name-ar" value={kid.nameAr} onChange={(e) => updateKid(i, { nameAr: e.target.value })} /></F>
              <div className="grid grid-cols-2 gap-3">
                <F label={t('dob')}><Input type="date" data-testid="fam-kid-dob" value={kid.dob} onChange={(e) => updateKid(i, { dob: e.target.value })} /></F>
                <F label={t('gender')}>
                  <ChipRow testid="fam-kid-gender"
                    options={[{ value: 'male', label: t('male') }, { value: 'female', label: t('female') }]}
                    value={kid.gender} onChange={(v) => updateKid(i, { gender: v })} />
                </F>
              </div>
              {membershipEnabled && (
                <F label={t('plan')}>{planChips(kid.planId, (id) => updateKid(i, { planId: id }), 'fam-kid-plan-chip')}</F>
              )}
            </div>
          ))}
          <Button size="sm" variant="outline" data-testid="fam-add-kid" onClick={() => setKids((ks) => [...ks, emptyKid()])}>
            <Plus className="me-1 h-3.5 w-3.5" /> {t('family.addKid')}
          </Button>
        </div>
      ),
    },
    {
      key: 'dual-hat',
      title: t('family.dualHat'),
      content: (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{t('family.dualHatHint')}</p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" data-testid="fam-parent-trains" checked={parentTrains}
              onChange={(e) => setParentTrains(e.target.checked)} className="h-4 w-4 accent-primary-700" />
            {t('family.parentTrains', { name: (fgFound?.name ?? fgName) || t('family.theParent') })}
          </label>
          {parentTrains && membershipEnabled && (
            <F label={t('family.parentPlan')}>{planChips(parentPlanId, setParentPlanId, 'fam-parent-plan-chip')}</F>
          )}
        </div>
      ),
    },
    {
      key: 'review',
      title: t('review'),
      content: (
        <div className="space-y-2" data-testid="fam-review">
          <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">{t('family.guardian')}: {fgFound?.name ?? fgName}{fgPhone ? ` · ${fgPhone}` : ''}</p>
            {kids.filter((k) => k.nameEn.trim()).map((k, i) => (
              <p key={i} data-testid="fam-review-kid">• {k.nameEn}{k.dob ? ` · ${k.dob}` : ''}{k.planId ? ` · ${plans.find((p) => p.id === k.planId)?.name}` : ''}</p>
            ))}
            {parentTrains && <p data-testid="fam-review-dualhat">• {t('family.parentAlsoTrains')}</p>}
          </div>
          <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm text-gray-700">
            <input type="checkbox" data-testid="fam-send-invite" checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)} className="h-4 w-4 accent-primary-700" />
            {t('family.sendAccess', { name: (fgFound?.name ?? fgName) || t('family.theParent') })}
          </label>
        </div>
      ),
    },
  ]

  return (
    <>
      <FormWizard
        open={open}
        onClose={() => { setOpen(false); router.push(`/${locale}/students`) }}
        title={mode === 'family' ? t('family.title') : t('title')}
        steps={mode === 'family' ? familySteps : soloSteps}
        onSubmit={mode === 'family' ? submitFamily : submitSolo}
        submitLabel={t('create')}
        busy={busy}
        locale={locale}
        testid="add-student-wizard"
      />
      {inviteResult && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md space-y-2" data-testid="fam-invite-done-panel">
              <InviteResultCard result={inviteResult} locale={locale} />
              <Button data-testid="fam-invite-done" className="w-full bg-primary-700 hover:bg-primary-800"
                onClick={() => { router.push(doneHref); router.refresh() }}>
                {t('family.done')}
              </Button>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
