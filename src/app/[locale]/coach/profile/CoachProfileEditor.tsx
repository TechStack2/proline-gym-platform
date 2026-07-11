'use client'

/**
 * COACH-LP — the coach's self-edit form (portal). Writes a PENDING draft via
 * saveCoachDraft; nothing reaches the public landing until an admin publishes in
 * Coach-360. Shows a clear "pending admin approval" state + a live preview of the
 * showcase card built from the draft values.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Award, Clock, Loader2, Save, Eye } from 'lucide-react'
import { saveCoachDraft } from './actions'
import { CoachPhotoDraftUpload } from './CoachPhotoDraftUpload'
import { useErrorText } from '@/lib/errors/use-error-text';

type Fields = {
  specialization_ar: string; specialization_en: string; specialization_fr: string
  bio_ar: string; bio_en: string; bio_fr: string
}

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
] as const

export function CoachProfileEditor({
  coachId, locale, name, avatarUrl, gymId, profileId, draftPhotoUrl, draftPhotoPath, live, pending, hasPending,
}: {
  coachId: string
  locale: string
  name: string
  avatarUrl: string | null
  gymId: string
  profileId: string
  draftPhotoUrl: string | null
  draftPhotoPath: string | null
  live: Fields
  pending: Partial<Fields> | null
  hasPending: boolean
}) {
  const t = useTranslations('coachEdit')
  const errText = useErrorText();
  const router = useRouter()
  const isRTL = locale === 'ar'
  const [pendingTx, startTx] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Seed from the pending draft if one exists, else the live values.
  const seed: Fields = {
    specialization_ar: pending?.specialization_ar ?? live.specialization_ar,
    specialization_en: pending?.specialization_en ?? live.specialization_en,
    specialization_fr: pending?.specialization_fr ?? live.specialization_fr,
    bio_ar: pending?.bio_ar ?? live.bio_ar,
    bio_en: pending?.bio_en ?? live.bio_en,
    bio_fr: pending?.bio_fr ?? live.bio_fr,
  }
  const [f, setF] = useState<Fields>(seed)
  const set = (k: keyof Fields, v: string) => { setF((p) => ({ ...p, [k]: v })); setSaved(false) }

  const submit = () => {
    setError('')
    startTx(async () => {
      const res = await saveCoachDraft({ coachId, ...f })
      if (res.ok) { setSaved(true); router.refresh() }
      else setError(errText(res.error))
    })
  }

  const lp = (base: 'specialization' | 'bio') =>
    (f[`${base}_${locale}` as keyof Fields] || f[`${base}_en` as keyof Fields] || '') as string

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm" data-testid="coach-profile-editor" data-coach-id={coachId}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
        {hasPending && (
          <span data-testid="coach-pending-badge" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            <Clock className="h-3 w-3" /> {t('pendingBadge')}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">{t('note')}</p>

      {/* Photo (staged as a draft — admin publishes from Coach-360) */}
      <CoachPhotoDraftUpload
        coachId={coachId}
        gymId={gymId}
        profileId={profileId}
        name={name}
        liveUrl={avatarUrl}
        draftUrl={draftPhotoUrl}
        draftPath={draftPhotoPath}
        locale={locale}
      />

      {/* Specialty (per language) */}
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{t('specialtyLabel')}</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        {LANGS.map((l) => (
          <input
            key={`spec-${l.code}`}
            data-testid={`coach-edit-spec-${l.code}`}
            dir={l.code === 'ar' ? 'rtl' : 'ltr'}
            value={f[`specialization_${l.code}` as keyof Fields]}
            onChange={(e) => set(`specialization_${l.code}` as keyof Fields, e.target.value)}
            placeholder={l.label}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-700 focus:outline-none focus:ring-1 focus:ring-primary-700"
          />
        ))}
      </div>

      {/* Bio (per language) */}
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{t('bioLabel')}</label>
      <div className="grid grid-cols-1 gap-2 mb-5">
        {LANGS.map((l) => (
          <textarea
            key={`bio-${l.code}`}
            data-testid={`coach-edit-bio-${l.code}`}
            dir={l.code === 'ar' ? 'rtl' : 'ltr'}
            rows={2}
            value={f[`bio_${l.code}` as keyof Fields]}
            onChange={(e) => set(`bio_${l.code}` as keyof Fields, e.target.value)}
            placeholder={`${t('bioLabel')} — ${l.label}`}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-700 focus:outline-none focus:ring-1 focus:ring-primary-700"
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="coach-save-draft"
          onClick={submit}
          disabled={pendingTx}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-800 disabled:opacity-60"
        >
          {pendingTx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('save')}
        </button>
        {saved && <span data-testid="coach-saved" className="text-sm font-medium text-green-700">{t('saved')}</span>}
        {error && <span data-testid="coach-save-error" className="text-sm text-red-600">{error}</span>}
      </div>

      {/* Preview of how it'll appear on the landing showcase once published. */}
      <div className="mt-6 border-t pt-5">
        <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Eye className="h-3.5 w-3.5" /> {t('previewTitle')}
        </p>
        <div data-testid="coach-preview" dir={isRTL ? 'rtl' : 'ltr'}
          className="mx-auto max-w-xs rounded-3xl bg-secondary-950 p-6 text-center ring-1 ring-white/10">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-secondary-800 ring-2 ring-primary-500/40">
            {avatarUrl
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
              : <span className="text-2xl font-extrabold text-primary-300">{(name[0] || '·').toUpperCase()}</span>}
          </div>
          <h4 className="text-lg font-bold text-white">{name}</h4>
          {lp('specialization') && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {lp('specialization').split(/[,،/]+/).map((s) => s.trim()).filter(Boolean).map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-primary-500/15 px-2.5 py-0.5 text-xs font-medium text-primary-300 ring-1 ring-primary-500/30">
                  <Award className="h-3 w-3" />{s}
                </span>
              ))}
            </div>
          )}
          {lp('bio') && <p className={cn('mt-3 text-sm text-gray-400 line-clamp-4', isRTL && 'text-right')}>{lp('bio')}</p>}
        </div>
      </div>
    </div>
  )
}
