'use client'

/**
 * Add-student wizard (UX-2 conversion of the prototype StudentForm — same
 * write path: the F1 create_student identity RPC; guardian linking reuses the
 * B3 search-by-phone-first flow; optional membership uses the staff RLS).
 * Steps: identity → guardian (minors — skippable) → plan (optional) → review.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { FormWizard, ChipRow } from '@/components/shared/form-wizard'
import { Search } from 'lucide-react'

type Plan = { id: string; name: string; price: number; durationDays: number }

// INTAKE-FOCUS: the labelled-field wrapper lives at MODULE SCOPE (stable type ref).
// Defined inside the render body, its identity changed on every keystroke → React
// treated <F> as a new component type and REMOUNTED the <Input> children → the cursor
// jumped out per character. Same fix as onboarding-client.tsx's module-level Field.
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

  // step 1 — identity
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  // step 2 — guardian (minors)
  const [gPhone, setGPhone] = useState('')
  const [gFound, setGFound] = useState<{ profileId: string; name: string } | null>(null)
  const [gSearched, setGSearched] = useState(false)
  const [gName, setGName] = useState('')
  const [gSkip, setGSkip] = useState(false)
  // step 3 — plan (optional)
  const [planId, setPlanId] = useState('')

  const isMinor = useMemo(() => {
    if (!dob) return false
    return (Date.now() - new Date(dob).getTime()) / (365.25 * 864e5) < 18
  }, [dob])

  const searchGuardian = async () => {
    setGSearched(true)
    setGFound(null)
    if (!gPhone.trim()) return
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name_ar, first_name_en, last_name_ar, last_name_en')
      .eq('gym_id', gymId)
      .ilike('phone', `%${gPhone.trim()}%`)
      .limit(1)
      .maybeSingle()
    if (data) {
      const name = [locale === 'ar' ? data.first_name_ar : data.first_name_en,
        locale === 'ar' ? data.last_name_ar : data.last_name_en].filter(Boolean).join(' ')
      setGFound({ profileId: data.id, name })
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      // 1) The F1 identity chain (unchanged write path).
      const { data: student, error } = await supabase.rpc('create_student', {
        p_first_name_ar: nameAr || nameEn,
        p_first_name_en: nameEn,
        p_first_name_fr: nameEn,
        p_last_name_ar: '', p_last_name_en: '', p_last_name_fr: '',
        p_phone: phone,
        p_gender: gender,
        p_date_of_birth: dob || null,
        p_emergency_contact_name: null, p_emergency_contact_phone: null,
        p_medical_notes: null, p_join_date: null, p_current_belt_rank: null,
      })
      if (error) throw error
      const studentId = (student as any)?.id

      // 2) Guardian (B3: search-by-phone-first; create-if-new).
      if (isMinor && !gSkip && studentId) {
        let profileId = gFound?.profileId ?? null
        if (!profileId && gName.trim() && gPhone.trim()) {
          const { data: prof, error: pErr } = await supabase
            .from('profiles')
            .insert({
              gym_id: gymId, phone: gPhone.trim(),
              first_name_ar: gName.trim(), first_name_en: gName.trim(), first_name_fr: gName.trim(),
              last_name_ar: '', last_name_en: '', last_name_fr: '',
            })
            .select('id').single()
          if (pErr) throw pErr
          profileId = prof.id
        }
        if (profileId) {
          let { data: g } = await supabase.from('guardians').select('id').eq('profile_id', profileId).maybeSingle()
          if (!g) {
            const { data: ng, error: gErr } = await supabase
              .from('guardians')
              .insert({ profile_id: profileId, gym_id: gymId, is_primary_contact: true })
              .select('id').single()
            if (gErr) throw gErr
            g = ng
          }
          const { error: lErr } = await supabase
            .from('guardian_students')
            .insert({ guardian_id: g!.id, student_id: studentId })
          if (lErr) throw lErr
        }
      }

      // 3) Optional membership (staff RLS; ML-1 lifecycle takes over from here).
      if (planId && studentId) {
        const plan = plans.find((p) => p.id === planId)!
        const end = new Date(Date.now() + plan.durationDays * 864e5).toISOString().slice(0, 10)
        const { error: mErr } = await supabase.from('student_memberships').insert({
          student_id: studentId, plan_id: planId,
          start_date: new Date().toISOString().slice(0, 10), end_date: end, status: 'active',
        })
        if (mErr) throw mErr
      }

      toast({ title: t('created'), variant: 'success' })
      router.push(`/${locale}/students/${studentId ?? ''}`)
      router.refresh()
    } catch (err: any) {
      toast({ title: t('failed'), description: err.message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    {
      key: 'identity',
      title: t('identity'),
      valid: nameEn.trim() !== '' && phone.trim() !== '',
      content: (
        <div className="space-y-3">
          <F label={t('nameEn')}><Input data-testid="sw-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></F>
          <F label={t('nameAr')}><Input dir="rtl" data-testid="sw-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></F>
          <F label={t('phone')}><Input dir="ltr" type="tel" data-testid="sw-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961…" /></F>
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
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-testid="sw-plan-none" onClick={() => setPlanId('')}
              className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                planId === '' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600')}>
              {t('noPlan')}
            </button>
            {plans.map((p) => (
              <button key={p.id} type="button" data-testid="sw-plan-chip" data-id={p.id}
                onClick={() => setPlanId(p.id)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                  planId === p.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700')}>
                {p.name} · ${p.price.toFixed(0)}
              </button>
            ))}
          </div>
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

  return (
    <FormWizard
      open={open}
      onClose={() => { setOpen(false); router.push(`/${locale}/students`) }}
      title={t('title')}
      steps={steps}
      onSubmit={submit}
      submitLabel={t('create')}
      busy={busy}
      locale={locale}
      testid="add-student-wizard"
    />
  )
}
