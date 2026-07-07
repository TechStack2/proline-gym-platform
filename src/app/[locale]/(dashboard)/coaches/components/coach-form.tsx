'use client'

/**
 * Coach form (ADM-1 rebuild) — the old form was written against an imagined
 * schema: it upserted coaches.name_ar/name_en/phone/email/specialization/bio/
 * status (NONE exist — names/phone live on PROFILES; the real columns are
 * specialization_{ar,en,fr}, bio_{ar,en,fr}, belt_rank, is_active, deleted_at)
 * and wrote a non-existent `coach_disciplines` join table → every add failed
 * PGRST204 ("bio not in schema cache").
 *
 * Real write path: a coach is a PROFILES row (identity: localized names +
 * phone; login-less, post-000018) + a COACHES row (profile_id, gym_id,
 * specialization_*, bio_*). Specialty = tappable CHIPS from the gym's
 * disciplines (SSOT) stored into specialization_{ar,en,fr} as the selected
 * disciplines' localized names (a join table is V2). No dropdowns (UX-1
 * convention). Edit mode updates both rows.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Camera } from 'lucide-react'
import { AvatarUpload, uploadAvatar } from '@/components/shared/avatar-upload'
import { FormWizard } from '@/components/shared/form-wizard'
import { inviteToPortal } from '@/lib/provisioning/invite'
import { CoachCreatedPanel } from './coach-created-panel'
import type { InviteResult } from '@/components/shared/invite-button'

type DisciplineRow = { id: string; name_ar: string; name_en: string; name_fr: string }

export type CoachInitialData = {
  coachId: string
  profileId: string
  gymId: string
  avatarUrl?: string | null
  first_name_ar: string | null
  first_name_en: string | null
  first_name_fr: string | null
  last_name_ar: string | null
  last_name_en: string | null
  last_name_fr: string | null
  phone: string | null
  specialization_ar: string | null
  specialization_en: string | null
  specialization_fr: string | null
  bio_ar: string | null
  bio_en: string | null
  bio_fr: string | null
}

interface CoachFormProps {
  disciplines: DisciplineRow[]
  locale: string
  initialData?: CoachInitialData
}

const SEP = ' · '

// FORM-FOCUS-SWEEP: the labelled-field wrapper lives at MODULE SCOPE (stable type ref).
// Defined inside the render body it got a new identity each keystroke → React remounted
// the <Input>/<Textarea> children → the cursor jumped out (the coach-edit phone-focus bug).
// Own props only, so it hoists cleanly. Same fix as onboarding-client.tsx's Field.
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function CoachForm({ disciplines, locale, initialData }: CoachFormProps) {
  const router = useRouter()
  const t = useTranslations('coaches.form')
  const isRTL = locale === 'ar'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ADM-2: on ADD there's no profile id yet — stash the picked photo and upload
  // it right after the profiles insert (edit mode uploads immediately).
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  // J2 COACH-UNIFY: the "Login?" toggle + the post-create hand-off. Once `created`
  // is set the wizard yields to <CoachCreatedPanel> (credentials + inline
  // availability); the create path is terminal so a re-submit can't duplicate.
  const [giveAccess, setGiveAccess] = useState(false)
  const [created, setCreated] = useState<{ coachId: string; gymId: string; name: string; invite: InviteResult | null } | null>(null)

  const [firstEn, setFirstEn] = useState(initialData?.first_name_en ?? '')
  const [lastEn, setLastEn] = useState(initialData?.last_name_en ?? '')
  const [firstAr, setFirstAr] = useState(initialData?.first_name_ar ?? '')
  const [lastAr, setLastAr] = useState(initialData?.last_name_ar ?? '')
  const [firstFr, setFirstFr] = useState(initialData?.first_name_fr ?? '')
  const [lastFr, setLastFr] = useState(initialData?.last_name_fr ?? '')
  const [phone, setPhone] = useState(initialData?.phone ?? '')
  const [bioEn, setBioEn] = useState(initialData?.bio_en ?? '')
  const [bioAr, setBioAr] = useState(initialData?.bio_ar ?? '')
  const [bioFr, setBioFr] = useState(initialData?.bio_fr ?? '')
  // Specialty chips: re-derive the selection from the stored EN names.
  const [selected, setSelected] = useState<string[]>(() => {
    if (!initialData?.specialization_en) return []
    const parts = initialData.specialization_en.split(SEP).map((x) => x.trim())
    return disciplines.filter((d) => parts.includes(d.name_en)).map((d) => d.id)
  })

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleSubmit = async () => {
    setError(null)
    if (!firstEn.trim()) { setError(t('errNameRequired')); return }
    if (selected.length === 0) { setError(t('errSpecialtyRequired')); return }
    if (!initialData && giveAccess && !phone.trim()) { setError(t('addPhoneForAccess')); return }
    setLoading(true)

    try {
      const supabase = createClient()
      const picked = disciplines.filter((d) => selected.includes(d.id))
      const spec = {
        specialization_ar: picked.map((d) => d.name_ar || d.name_en).join(SEP),
        specialization_en: picked.map((d) => d.name_en).join(SEP),
        specialization_fr: picked.map((d) => d.name_fr || d.name_en).join(SEP),
      }
      const profilePayload = {
        first_name_en: firstEn.trim(),
        first_name_ar: firstAr.trim() || firstEn.trim(),
        first_name_fr: firstFr.trim() || firstEn.trim(),
        last_name_en: lastEn.trim(),
        last_name_ar: lastAr.trim() || lastEn.trim(),
        last_name_fr: lastFr.trim() || lastEn.trim(),
        phone: phone.trim() || null,
      }
      const coachPayload = {
        ...spec,
        bio_en: bioEn.trim() || null,
        bio_ar: bioAr.trim() || null,
        bio_fr: bioFr.trim() || null,
      }

      if (initialData) {
        const { error: pErr } = await supabase.from('profiles').update(profilePayload).eq('id', initialData.profileId)
        if (pErr) throw pErr
        const { error: cErr } = await supabase.from('coaches').update(coachPayload).eq('id', initialData.coachId)
        if (cErr) throw cErr
        router.push(`/${locale}/coaches`)
        router.refresh()
        return
      }

      // ── Add: one login-less identity (000018: profiles.id defaults gen_random_uuid). ──
      const { data: { user } } = await supabase.auth.getUser()
      const { data: prof } = await supabase.from('profiles').select('gym_id').eq('id', user?.id ?? '').single()
      if (!prof?.gym_id) throw new Error(t('errNoGym'))
      const { data: newProfile, error: pErr } = await supabase
        .from('profiles')
        .insert({ gym_id: prof.gym_id, ...profilePayload })
        .select('id')
        .single()
      if (pErr) throw pErr
      const { data: newCoach, error: cErr } = await supabase
        .from('coaches')
        .insert({ profile_id: newProfile.id, gym_id: prof.gym_id, is_active: true, ...coachPayload })
        .select('id')
        .single()
      if (cErr) throw cErr
      if (pendingPhoto) {
        // Best-effort: a failed photo upload must not lose the saved coach.
        try { await uploadAvatar(prof.gym_id, newProfile.id, pendingPhoto) } catch { /* noop */ }
      }

      // "Login?" ON → adopt THIS profile into a real login via the SAME provisioning
      // path as staff-invite (inviteToPortal — never a fork). The login attaches to
      // the coaches row we just created: ONE identity, never a duplicate.
      let invite: InviteResult | null = null
      if (giveAccess) {
        const res = await inviteToPortal({ coachId: newCoach.id })
        if (res.ok) invite = { tempPassword: res.tempPassword, login: res.login, waPhone: res.waPhone, gymName: res.gymName }
        else console.error('[coach-unify] invite failed:', res.error) // coach exists — upgrade later from Coach-360
      }

      // Hand off to the post-create phase (credentials + inline availability — the
      // J3 "guide them to availability" step, now inline). The create is TERMINAL:
      // no redirect and no re-submit (a re-submit would duplicate the identity).
      setCreated({ coachId: newCoach.id, gymId: prof.gym_id, name: `${firstEn.trim()} ${lastEn.trim()}`.trim(), invite })
      setLoading(false)
    } catch (err: any) {
      setError(err?.message || t('errSaveFailed'))
      setLoading(false)
    }
  }

  const dName = (d: DisciplineRow) => (isRTL ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en

  const steps = [
    {
      key: 'identity',
      title: t('stepIdentity'),
      valid: firstEn.trim() !== '',
      content: (
        <div className="space-y-3">
          {error && (
            <div data-testid="coach-form-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="flex items-center gap-3">
            {initialData ? (
              <AvatarUpload
                gymId={initialData.gymId}
                profileId={initialData.profileId}
                name={`${firstEn} ${lastEn}`.trim() || '?'}
                currentUrl={initialData.avatarUrl}
                size="lg"
                locale={locale}
              />
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <Camera className="h-4 w-4" />
                {pendingPhoto ? pendingPhoto.name : t('photoOptional')}
                <input type="file" accept="image/*" className="hidden" data-testid="coach-photo-input"
                  onChange={(e) => setPendingPhoto(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label={`${t('firstEn')} *`}><Input data-testid="coach-first-en" value={firstEn} onChange={(e) => setFirstEn(e.target.value)} /></F>
            <F label={t('lastEn')}><Input data-testid="coach-last-en" value={lastEn} onChange={(e) => setLastEn(e.target.value)} /></F>
            <F label={t('firstAr')}><Input dir="rtl" value={firstAr} onChange={(e) => setFirstAr(e.target.value)} /></F>
            <F label={t('lastAr')}><Input dir="rtl" value={lastAr} onChange={(e) => setLastAr(e.target.value)} /></F>
            <F label={t('firstFr')}><Input value={firstFr} onChange={(e) => setFirstFr(e.target.value)} /></F>
            <F label={t('lastFr')}><Input value={lastFr} onChange={(e) => setLastFr(e.target.value)} /></F>
          </div>
          <F label={t('phone')}><Input data-testid="coach-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+961…" /></F>
        </div>
      ),
    },
    {
      key: 'specialty',
      title: t('stepSpecialty'),
      valid: selected.length > 0,
      content: (
        <div className="space-y-3">
          <F label={`${t('specialty')} *`}>
            <div className="flex flex-wrap gap-1.5">
              {disciplines.map((d) => (
                <button key={d.id} type="button" data-testid="coach-specialty-chip" data-id={d.id}
                  onClick={() => toggle(d.id)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    selected.includes(d.id)
                      ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                  {dName(d)}
                </button>
              ))}
            </div>
            {disciplines.length === 0 && <p className="text-xs text-gray-400">{t('noDisciplines')}</p>}
          </F>
          <F label={t('bioEn')}><Textarea data-testid="coach-bio-en" rows={2} value={bioEn} onChange={(e) => setBioEn(e.target.value)} /></F>
          <F label={t('bioAr')}><Textarea dir="rtl" rows={2} value={bioAr} onChange={(e) => setBioAr(e.target.value)} /></F>
          <F label={t('bioFr')}><Textarea rows={2} value={bioFr} onChange={(e) => setBioFr(e.target.value)} /></F>
        </div>
      ),
    },
    initialData
      ? {
          key: 'review',
          title: t('stepReview'),
          content: (
            <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700" data-testid="coach-review">
              {error && (
                <div data-testid="coach-form-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <p className="font-semibold text-gray-900">{firstEn} {lastEn}</p>
              {phone && <p dir="ltr">{phone}</p>}
              <p>{disciplines.filter((d) => selected.includes(d.id)).map(dName).join(SEP) || '—'}</p>
            </div>
          ),
        }
      : {
          // J2 COACH-UNIFY: "Login?" — one clear toggle. ON adopts the coach into a
          // real app login (same provisioning path as staff-invite); OFF keeps the
          // login-less identity the desk manages on their behalf.
          key: 'login',
          title: t('stepLogin'),
          valid: !giveAccess || phone.trim() !== '',
          content: (
            <div className="space-y-3">
              {error && (
                <div data-testid="coach-form-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <div className="rounded-xl border border-gray-200 p-3">
                <p className={cn('text-sm font-medium text-gray-900', isRTL && 'font-arabic')}>
                  {t('giveAccessLabel', { name: firstEn.trim() || t('thisCoach') })}
                </p>
                <p className={cn('mt-0.5 text-xs text-gray-500', isRTL && 'font-arabic')}>
                  {giveAccess ? t('giveAccessOn') : t('giveAccessOff', { name: firstEn.trim() || t('thisCoach') })}
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" data-testid="coach-access-yes" data-active={giveAccess}
                    onClick={() => setGiveAccess(true)}
                    className={cn('flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                      giveAccess ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                    {t('accessYes')}
                  </button>
                  <button type="button" data-testid="coach-access-no" data-active={!giveAccess}
                    onClick={() => setGiveAccess(false)}
                    className={cn('flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                      !giveAccess ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                    {t('accessNo')}
                  </button>
                </div>
                {giveAccess && phone.trim() === '' && (
                  <p data-testid="coach-access-needs-phone" className={cn('mt-2 text-xs text-amber-600', isRTL && 'font-arabic')}>
                    {t('addPhoneForAccess')}
                  </p>
                )}
              </div>
            </div>
          ),
        },
  ]

  // J2 COACH-UNIFY: a successful create hands off to the post-create phase
  // (credentials when a login was granted + inline availability). Terminal — the
  // wizard is gone, so a stray re-submit can't create a second identity.
  if (created) {
    return (
      <CoachCreatedPanel
        coachId={created.coachId}
        gymId={created.gymId}
        coachName={created.name}
        locale={locale}
        inviteResult={created.invite}
      />
    )
  }

  return (
    <FormWizard
      open
      onClose={() => router.push(`/${locale}/coaches`)}
      title={initialData ? t('editTitle') : t('addTitle')}
      steps={steps}
      onSubmit={handleSubmit}
      submitLabel={initialData ? t('save') : t('createCoach')}
      busy={loading}
      locale={locale}
      testid="coach-form"
    />
  )
}
