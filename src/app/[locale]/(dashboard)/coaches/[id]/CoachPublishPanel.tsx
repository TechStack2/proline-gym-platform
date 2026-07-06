'use client'

/**
 * COACH-LP — the admin's final gate, in Coach-360. Shows the coach's PENDING
 * draft (diff vs live), a "Publish to live" action (owner/head_coach only), a
 * landing visibility + "coming soon" control, and a staff direct-edit form.
 * Reception can edit (writes a draft) but the publish/visibility controls are
 * hidden + the RPC enforces owner/head_coach.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Clock, Loader2, Rocket, Pencil, Eye, EyeOff, ArrowRight, ImageIcon } from 'lucide-react'
import { Avatar } from '@/components/shared/avatar'
import { publishCoachProfile, setCoachLanding, saveCoachDraftStaff } from './actions'

type Fields = {
  specialization_ar: string; specialization_en: string; specialization_fr: string
  bio_ar: string; bio_en: string; bio_fr: string
}
const LANGS = [{ code: 'en', label: 'EN' }, { code: 'ar', label: 'AR' }, { code: 'fr', label: 'FR' }] as const

export function CoachPublishPanel({
  coachId, locale, canPublish, live, pending, hasPending, landingVisible, landingStatus, lastPublishedAt,
  name, livePhotoUrl, draftPhotoUrl, hasPhotoDraft,
}: {
  coachId: string
  locale: string
  canPublish: boolean
  live: Fields
  pending: Partial<Fields> | null
  hasPending: boolean
  landingVisible: boolean
  landingStatus: string
  lastPublishedAt: string | null
  name: string
  livePhotoUrl: string | null
  draftPhotoUrl: string | null
  hasPhotoDraft: boolean
}) {
  const t = useTranslations('coachPublish')
  const router = useRouter()
  const isRTL = locale === 'ar'
  const [tx, startTx] = useTransition()
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const seed: Fields = {
    specialization_ar: pending?.specialization_ar ?? live.specialization_ar,
    specialization_en: pending?.specialization_en ?? live.specialization_en,
    specialization_fr: pending?.specialization_fr ?? live.specialization_fr,
    bio_ar: pending?.bio_ar ?? live.bio_ar,
    bio_en: pending?.bio_en ?? live.bio_en,
    bio_fr: pending?.bio_fr ?? live.bio_fr,
  }
  const [f, setF] = useState<Fields>(seed)
  const set = (k: keyof Fields, v: string) => setF((p) => ({ ...p, [k]: v }))
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError('')
    startTx(async () => {
      const res = await fn()
      if (res.ok) router.refresh()
      else setError(res.error || 'error')
    })
  }

  const lk = (base: 'specialization' | 'bio') => `${base}_${locale}` as keyof Fields
  const liveVal = (base: 'specialization' | 'bio') => (live[lk(base)] || live[`${base}_en` as keyof Fields] || '') as string
  const draftVal = (base: 'specialization' | 'bio') => ((pending?.[lk(base)] ?? pending?.[`${base}_en` as keyof Fields]) || '') as string

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm" data-testid="coach-publish-panel" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={cn('text-base font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
        <span data-testid="coach360-landing-status" data-visible={landingVisible} data-status={landingStatus}
          className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
            landingVisible ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>
          {landingVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {landingVisible ? t(landingStatus === 'coming_soon' ? 'liveComingSoon' : 'liveActive') : t('notVisible')}
        </span>
      </div>

      {/* Pending draft → diff vs live */}
      {hasPending ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="coach360-pending-diff">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <Clock className="h-3.5 w-3.5" /> {t('pendingTitle')}
          </p>
          {(['specialization', 'bio'] as const).map((base) => (
            <div key={base} className="mb-2 text-sm">
              <span className="text-xs font-medium uppercase text-gray-400">{t(base)}</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-400 line-through">{liveVal(base) || '—'}</span>
                <ArrowRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="font-medium text-gray-900" data-testid={`coach360-draft-${base}`}>{draftVal(base) || '—'}</span>
              </div>
            </div>
          ))}

          {/* Photo diff (before → after) — COACH-PHOTO-GATE */}
          {hasPhotoDraft && (
            <div className="mt-3 text-sm" data-testid="coach360-photo-diff">
              <span className="inline-flex items-center gap-1 text-xs font-medium uppercase text-gray-400">
                <ImageIcon className="h-3.5 w-3.5" /> {t('photo')}
              </span>
              <div className="mt-1 flex items-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <Avatar url={livePhotoUrl} name={name} size="md" />
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('photoLive')}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-600 shrink-0" />
                <div className="flex flex-col items-center gap-1">
                  {draftPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draftPhotoUrl} alt={name} data-testid="coach360-photo-draft"
                      className="h-12 w-12 rounded-full object-cover ring-2 ring-amber-400" />
                  ) : (
                    <Avatar url={null} name={name} size="md" />
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-amber-700">{t('photoNew')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500" data-testid="coach360-no-pending">{t('noPending')}</p>
      )}

      {/* Admin controls — owner/head_coach only */}
      {canPublish && (
        <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="coach360-admin-controls">
          <button type="button" data-testid="coach360-publish" disabled={tx}
            onClick={() => run(() => publishCoachProfile({ coachId }))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-[#a81014] disabled:opacity-60">
            {tx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} {t('publish')}
          </button>
          <button type="button" data-testid="coach360-toggle-comingsoon" disabled={tx}
            onClick={() => run(() => setCoachLanding({ coachId, visible: true, status: landingStatus === 'coming_soon' ? 'active' : 'coming_soon' }))}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Clock className="h-4 w-4" /> {landingStatus === 'coming_soon' ? t('markActive') : t('markComingSoon')}
          </button>
          {landingVisible && (
            <button type="button" data-testid="coach360-hide" disabled={tx}
              onClick={() => run(() => setCoachLanding({ coachId, visible: false, status: landingStatus as 'active' | 'coming_soon' }))}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <EyeOff className="h-4 w-4" /> {t('hide')}
            </button>
          )}
        </div>
      )}

      {/* Staff direct edit (reception incl.) — writes a draft; an admin publishes. */}
      <div className="mt-4 border-t pt-4">
        <button type="button" data-testid="coach360-edit-toggle" onClick={() => setEditOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
          <Pencil className="h-4 w-4" /> {t('editDirect')}
        </button>
        {editOpen && (
          <div className="mt-3 space-y-2" data-testid="coach360-editor">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('specialization')}</label>
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map((l) => (
                <input key={`s-${l.code}`} data-testid={`coach360-edit-spec-${l.code}`} dir={l.code === 'ar' ? 'rtl' : 'ltr'}
                  value={f[`specialization_${l.code}` as keyof Fields]} onChange={(e) => set(`specialization_${l.code}` as keyof Fields, e.target.value)}
                  placeholder={l.label} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#cd1419] focus:outline-none" />
              ))}
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('bio')}</label>
            {LANGS.map((l) => (
              <textarea key={`b-${l.code}`} data-testid={`coach360-edit-bio-${l.code}`} dir={l.code === 'ar' ? 'rtl' : 'ltr'} rows={2}
                value={f[`bio_${l.code}` as keyof Fields]} onChange={(e) => set(`bio_${l.code}` as keyof Fields, e.target.value)}
                placeholder={l.label} className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#cd1419] focus:outline-none" />
            ))}
            <button type="button" data-testid="coach360-save-draft" disabled={tx}
              onClick={() => run(() => saveCoachDraftStaff({ coachId, ...f }))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60">
              {tx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} {t('saveDraft')}
            </button>
          </div>
        )}
      </div>

      {error && <p data-testid="coach-publish-error" className="mt-3 text-sm text-red-600">{error}</p>}
      {lastPublishedAt && <p className="mt-3 text-xs text-gray-400">{t('lastPublished')}: {new Date(lastPublishedAt).toLocaleDateString(locale)}</p>}
    </section>
  )
}
