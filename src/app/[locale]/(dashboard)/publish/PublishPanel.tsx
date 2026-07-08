'use client'

/**
 * J6 GO-LIVE-PANEL — the interactive body of /publish. Everything that mutates or
 * reads live client state lives here; the server page just gates + hydrates it.
 *
 * The toggles REUSE the platform's existing write paths verbatim (no fork):
 *   • class visibility → a direct `classes.show_on_landing` update through the
 *     browser client, exactly as ClassDetail's publish toggle does (staff RLS is
 *     the tenant boundary);
 *   • coach visibility → the shared `setCoachLanding` server action → the
 *     `set_coach_landing` RPC (owner/head_coach gate lives in the RPC). The coach's
 *     existing landing_status (active / coming_soon) is preserved — this control
 *     only flips visibility.
 * Optimistic: flip local state immediately, revert on failure. The STATUS row is
 * derived from that same live state, so it stays honest as you toggle.
 */
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { setCoachLanding } from '../coaches/[id]/actions'
import { ShareableLink } from '@/components/shared/shareable-link'
import { cn } from '@/lib/utils'
import { CalendarClock, Users, CreditCard, Dumbbell, Tent, ExternalLink, Loader2 } from 'lucide-react'

type ClassItem = { id: string; name: string; visible: boolean }
type CoachItem = { id: string; name: string; visible: boolean; status: 'active' | 'coming_soon' }
type CampItem = { id: string; name: string; visible: boolean }

export function PublishPanel({
  locale,
  isRTL,
  slug,
  initialClasses,
  initialCoaches,
  initialCamps,
  planCount,
  ptVisible,
  ptTotal,
}: {
  locale: string
  isRTL: boolean
  slug: string | null
  initialClasses: ClassItem[]
  initialCoaches: CoachItem[]
  initialCamps: CampItem[]
  planCount: number
  ptVisible: number
  ptTotal: number
}) {
  const t = useTranslations('publish')
  const supabase = createClient()
  const [classes, setClasses] = useState<ClassItem[]>(initialClasses)
  const [coaches, setCoaches] = useState<CoachItem[]>(initialCoaches)
  const [camps, setCamps] = useState<CampItem[]>(initialCamps)
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const classesVisible = classes.filter((c) => c.visible).length
  const coachesVisible = coaches.filter((c) => c.visible).length
  const campsVisible = camps.filter((c) => c.visible).length

  async function toggleClass(id: string) {
    if (busy) return
    const cur = classes.find((c) => c.id === id)
    if (!cur) return
    const next = !cur.visible
    setBusy(id)
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, visible: next } : c))) // optimistic
    const { error } = await supabase.from('classes').update({ show_on_landing: next }).eq('id', id)
    if (error) {
      setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, visible: cur.visible } : c))) // revert
    }
    setBusy(null)
  }

  async function toggleCoach(id: string) {
    if (busy) return
    const cur = coaches.find((c) => c.id === id)
    if (!cur) return
    const next = !cur.visible
    setBusy(id)
    setCoaches((prev) => prev.map((c) => (c.id === id ? { ...c, visible: next } : c))) // optimistic
    const res = await setCoachLanding({ coachId: id, visible: next, status: cur.status })
    if (!res.ok) {
      setCoaches((prev) => prev.map((c) => (c.id === id ? { ...c, visible: cur.visible } : c))) // revert
    }
    setBusy(null)
  }

  // M2-B: camp visibility mirrors the CLASS path — a direct browser-client
  // camps.show_on_landing update (staff RLS is the tenant boundary), optimistic-then-revert.
  async function toggleCamp(id: string) {
    if (busy) return
    const cur = camps.find((c) => c.id === id)
    if (!cur) return
    const next = !cur.visible
    setBusy(id)
    setCamps((prev) => prev.map((c) => (c.id === id ? { ...c, visible: next } : c))) // optimistic
    const { error } = await supabase.from('camps').update({ show_on_landing: next }).eq('id', id)
    if (error) {
      setCamps((prev) => prev.map((c) => (c.id === id ? { ...c, visible: cur.visible } : c))) // revert
    }
    setBusy(null)
  }

  return (
    <div className="space-y-5" data-testid="publish-panel">
      {/* ── STATUS: a live read-out of what the public page shows ── */}
      <section
        data-testid="publish-status"
        data-classes-visible={classesVisible}
        data-coaches-visible={coachesVisible}
        data-plans={planCount}
        data-pt-visible={ptVisible}
        data-camps-visible={campsVisible}
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <p className={cn('mb-3 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('statusTitle')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat icon={CalendarClock} value={`${classesVisible}/${classes.length}`} label={t('statClasses')} isRTL={isRTL} />
          <Stat icon={Users} value={`${coachesVisible}/${coaches.length}`} label={t('statCoaches')} isRTL={isRTL} />
          <Stat icon={CreditCard} value={String(planCount)} label={t('statPlans')} isRTL={isRTL} />
          <Stat icon={Dumbbell} value={`${ptVisible}/${ptTotal}`} label={t('statPt')} isRTL={isRTL} />
          <Stat icon={Tent} value={`${campsVisible}/${camps.length}`} label={t('statCamps')} isRTL={isRTL} />
        </div>
      </section>

      {/* ── Classes — per-class visibility ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <CalendarClock className="h-4 w-4 text-primary-600" /> {t('classesTitle')}
        </h2>
        <p className={cn('mt-0.5 text-xs text-gray-500', isRTL && 'font-arabic')}>{t('classesHint')}</p>
        <div className="mt-3 divide-y divide-gray-100" data-testid="publish-classes">
          {classes.length === 0 ? (
            <p className="py-2 text-sm text-gray-400">{t('noClasses')}</p>
          ) : (
            classes.map((c) => (
              <ToggleRow
                key={c.id}
                testid="publish-class-toggle"
                id={c.id}
                name={c.name}
                on={c.visible}
                loading={busy === c.id}
                disabled={!!busy && busy !== c.id}
                onToggle={() => startTransition(() => { void toggleClass(c.id) })}
                onLabel={t('visible')}
                offLabel={t('hidden')}
                isRTL={isRTL}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Coaches — per-coach visibility ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Users className="h-4 w-4 text-primary-600" /> {t('coachesTitle')}
        </h2>
        <p className={cn('mt-0.5 text-xs text-gray-500', isRTL && 'font-arabic')}>{t('coachesHint')}</p>
        <div className="mt-3 divide-y divide-gray-100" data-testid="publish-coaches">
          {coaches.length === 0 ? (
            <p className="py-2 text-sm text-gray-400">{t('noCoaches')}</p>
          ) : (
            coaches.map((c) => (
              <ToggleRow
                key={c.id}
                testid="publish-coach-toggle"
                id={c.id}
                name={c.name}
                on={c.visible}
                loading={busy === c.id}
                disabled={!!busy && busy !== c.id}
                onToggle={() => startTransition(() => { void toggleCoach(c.id) })}
                onLabel={t('visible')}
                offLabel={t('hidden')}
                isRTL={isRTL}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Camps — per-camp visibility (M2-B: mirrors the class toggle path) ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Tent className="h-4 w-4 text-primary-600" /> {t('campsTitle')}
        </h2>
        <p className={cn('mt-0.5 text-xs text-gray-500', isRTL && 'font-arabic')}>{t('campsHint')}</p>
        <div className="mt-3 divide-y divide-gray-100" data-testid="publish-camps">
          {camps.length === 0 ? (
            <p className="py-2 text-sm text-gray-400">{t('noCamps')}</p>
          ) : (
            camps.map((c) => (
              <ToggleRow
                key={c.id}
                testid="publish-camp-toggle"
                id={c.id}
                name={c.name}
                on={c.visible}
                loading={busy === c.id}
                disabled={!!busy && busy !== c.id}
                onToggle={() => startTransition(() => { void toggleCamp(c.id) })}
                onLabel={t('visible')}
                offLabel={t('hidden')}
                isRTL={isRTL}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Links — share the public site + the member login ── */}
      {slug && (
        <section data-testid="publish-links" className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
            <ExternalLink className="h-4 w-4 text-primary-600" /> {t('linksTitle')}
          </h2>
          <ShareableLink
            testid="publish-landing"
            path={`/${locale}?gym=${encodeURIComponent(slug)}`}
            label={t('landingLabel')}
            copyLabel={t('copy')}
            copiedLabel={t('copied')}
            shareMessage={t('shareText')}
            shareLabel={t('share')}
          />
          <ShareableLink
            testid="publish-login"
            path={`/${locale}/auth/login`}
            label={t('loginLabel')}
            copyLabel={t('copy')}
            copiedLabel={t('copied')}
          />
          <a
            href={`/${locale}?gym=${encodeURIComponent(slug)}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="publish-preview"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-700"
          >
            {t('preview')} <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      )}
    </div>
  )
}

/** A labelled stat tile in the STATUS row. */
function Stat({
  icon: Icon,
  value,
  label,
  isRTL,
}: {
  icon: typeof CalendarClock
  value: string
  label: string
  isRTL: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <Icon className="h-4 w-4 text-gray-400" />
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
      <p className={cn('text-xs text-gray-500', isRTL && 'font-arabic')}>{label}</p>
    </div>
  )
}

/** One name + on/off visibility switch. Module-scope (no in-render component). */
function ToggleRow({
  testid,
  id,
  name,
  on,
  loading,
  disabled,
  onToggle,
  onLabel,
  offLabel,
  isRTL,
}: {
  testid: string
  id: string
  name: string
  on: boolean
  loading: boolean
  disabled: boolean
  onToggle: () => void
  onLabel: string
  offLabel: string
  isRTL: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className={cn('min-w-0 flex-1 truncate text-sm font-medium text-gray-800', isRTL && 'font-arabic')}>{name}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn('text-xs font-medium', on ? 'text-green-600' : 'text-gray-400')}>{on ? onLabel : offLabel}</span>
        <button
          type="button"
          data-testid={testid}
          data-id={id}
          data-on={on}
          disabled={disabled || loading}
          onClick={onToggle}
          aria-pressed={on}
          className="relative inline-flex items-center disabled:opacity-50"
        >
          <span className={cn('relative h-6 w-11 rounded-full transition-colors', on ? 'bg-[#cd1419]' : 'bg-gray-200')}>
            <span
              className={cn(
                'absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-all',
                on ? (isRTL ? 'right-5' : 'left-5') : (isRTL ? 'right-0.5' : 'left-0.5'),
              )}
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}
