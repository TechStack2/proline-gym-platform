import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { getSetupMilestones, type MilestoneKey, type SetupMilestone } from '@/lib/gym/setup-checklist'
import { roleHomePath } from '../../onboarding/role-home'
import { ShareableLink } from '@/components/shared/shareable-link'
import type { LucideIcon } from 'lucide-react'
import {
  Building2, Users, CalendarClock, CreditCard, UserPlus, Rocket,
  Check, ArrowRight, ArrowUpRight, Sparkles, PartyPopper,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * J1 SETUP-HUB — the guided setup experience (Owner Journey 2.0). A staff-gated
 * hub that turns the passive /today checklist into six friendly, DERIVED milestone
 * cards (no stored setup state, no migration): each card auto-completes the instant
 * the underlying work is done and otherwise deep-links to the one place that does it.
 * Modern/guided/tender: progress bar, chips, plain language, a CSS-only celebratory
 * state at 6/6 — never a long open form. Dark + RTL safe via the neutral channel-var
 * palette + logical direction handling.
 */

const ICONS: Record<MilestoneKey, LucideIcon> = {
  gym: Building2,
  team: Users,
  classes: CalendarClock,
  offers: CreditCard,
  members: UserPlus,
  golive: Rocket,
}

const STAFF_ROLES = ['owner', 'head_coach', 'receptionist']

export default async function SetupPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = await createClient()

  // Per-page preamble (dashboard convention): auth + gym, then a staff gate — the
  // (dashboard) layout only asserts auth and the middleware doesn't block a coach
  // from a non-/dashboard staff path, so /setup gates itself.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = me?.gym_id
  if (!gymId) return null
  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  const role = roleRow?.role as string | undefined
  if (!role || !STAFF_ROLES.includes(role)) redirect(`/${locale}${roleHomePath(role)}`)

  const { milestones, doneCount, total, allDone, slug } = await getSetupMilestones(supabase, gymId)
  const t = await getTranslations('setupHub')
  const isRTL = locale === 'ar'
  const byKey = Object.fromEntries(milestones.map((m) => [m.key, m])) as Record<MilestoneKey, SetupMilestone>

  const gym = byKey.gym
  const team = byKey.team
  const classes = byKey.classes
  const offers = byKey.offers
  const members = byKey.members
  const golive = byKey.golive
  const doneLabel = t('doneChip')

  return (
    <div
      data-testid="setup-hub"
      data-done={doneCount}
      data-total={total}
      data-all-done={allDone}
      dir={isRTL ? 'rtl' : 'ltr'}
      className={cn('mx-auto max-w-3xl space-y-5', isRTL && 'text-right')}
    >
      {/* ── Header: friendly title + derived progress ── */}
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#cd1419]/10 text-primary-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
            {allDone ? t('done.title') : t('title')}
          </h1>
        </div>
        <p className={cn('mt-1 text-sm text-gray-500', isRTL && 'font-arabic')}>
          {allDone ? t('done.subtitle') : t('subtitle')}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-primary-600 transition-all duration-500"
              style={{ width: `${Math.round((doneCount / total) * 100)}%` }}
            />
          </div>
          <span data-testid="setup-hub-progress" className="shrink-0 text-sm font-semibold text-gray-700">
            {t('progress', { done: doneCount, total })}
          </span>
        </div>
      </div>

      {/* ── Celebratory completed state (CSS only — no confetti lib) ── */}
      {allDone && (
        <div
          data-testid="setup-hub-complete"
          className="flex items-center gap-3 rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-600 text-primary-foreground">
            <PartyPopper className="h-6 w-6" />
          </span>
          <p className={cn('text-sm font-medium text-green-800', isRTL && 'font-arabic')}>{t('done.banner')}</p>
        </div>
      )}

      {/* ── The six milestone cards ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* M1 — Your gym */}
        <MilestoneCard
          mKey="gym"
          done={gym.done}
          icon={ICONS.gym}
          title={t('milestones.gym.title')}
          desc={t('milestones.gym.desc')}
          doneLabel={doneLabel}
          isRTL={isRTL}
        >
          {!gym.done && (
            <Cta href={`/${locale}/settings?tab=gym`} label={t('milestones.gym.cta')} testid="milestone-gym-cta" isRTL={isRTL} />
          )}
        </MilestoneCard>

        {/* M2 — Your team (bookable sub-state) */}
        <MilestoneCard
          mKey="team"
          done={team.done}
          icon={ICONS.team}
          title={t('milestones.team.title')}
          desc={t('milestones.team.desc')}
          doneLabel={doneLabel}
          isRTL={isRTL}
        >
          {!team.detail.hasCoaches ? (
            <Cta href={`/${locale}/coaches/add`} label={t('milestones.team.cta')} testid="milestone-team-cta" isRTL={isRTL} />
          ) : team.detail.bookable ? (
            <p className="text-sm font-medium text-green-700">{t('milestones.team.bookable')}</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm text-gray-500">{t('milestones.team.notBookable')}</p>
              {team.detail.firstCoachId && (
                <SubLink
                  href={`/${locale}/coaches/${team.detail.firstCoachId}#panel-availability`}
                  label={t('milestones.team.setAvailability')}
                  testid="milestone-team-availability"
                  isRTL={isRTL}
                />
              )}
            </div>
          )}
        </MilestoneCard>

        {/* M3 — Your classes */}
        <MilestoneCard
          mKey="classes"
          done={classes.done}
          icon={ICONS.classes}
          title={t('milestones.classes.title')}
          desc={t('milestones.classes.desc')}
          doneLabel={doneLabel}
          isRTL={isRTL}
        >
          {!classes.done && (
            <Cta href={`/${locale}/classes`} label={t('milestones.classes.cta')} testid="milestone-classes-cta" isRTL={isRTL} />
          )}
        </MilestoneCard>

        {/* M4 — Your offers (product-gated CTAs) */}
        <MilestoneCard
          mKey="offers"
          done={offers.done}
          icon={ICONS.offers}
          title={t('milestones.offers.title')}
          desc={t('milestones.offers.desc')}
          doneLabel={doneLabel}
          isRTL={isRTL}
        >
          {!offers.done && (
            <div className="flex flex-wrap gap-2">
              {offers.detail.membershipEnabled && !offers.detail.planDone && (
                <Cta href={`/${locale}/settings?tab=plans`} label={t('milestones.offers.cta')} testid="milestone-offers-cta" isRTL={isRTL} />
              )}
              {offers.detail.ptEnabled && !offers.detail.ptDone && (
                <SubLink href={`/${locale}/settings?tab=ptpackages`} label={t('milestones.offers.ctaPt')} testid="milestone-offers-cta-pt" isRTL={isRTL} />
              )}
            </div>
          )}
        </MilestoneCard>

        {/* M5 — Your members */}
        <MilestoneCard
          mKey="members"
          done={members.done}
          icon={ICONS.members}
          title={t('milestones.members.title')}
          desc={t('milestones.members.desc')}
          doneLabel={doneLabel}
          isRTL={isRTL}
        >
          {!members.done && (
            <Cta href={`/${locale}/students/add`} label={t('milestones.members.cta')} testid="milestone-members-cta" isRTL={isRTL} />
          )}
        </MilestoneCard>

        {/* M6 — Go live (spans full width: links + share) */}
        <div
          data-testid="milestone-golive"
          data-done={golive.done}
          className={cn(
            'rounded-2xl border p-4 shadow-sm sm:col-span-2',
            golive.done ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-white',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                golive.done ? 'bg-green-600 text-primary-foreground' : 'bg-[#cd1419]/10 text-primary-600',
              )}
            >
              {golive.done ? <Check className="h-5 w-5" /> : <Rocket className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn('font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('milestones.golive.title')}</p>
                {golive.done && <DoneChip label={doneLabel} />}
              </div>
              <p className={cn('mt-0.5 text-sm text-gray-500', isRTL && 'font-arabic')}>{t('milestones.golive.desc')}</p>
              <p className={cn('mt-1 text-sm font-medium', golive.done ? 'text-green-700' : 'text-amber-600')}>
                {golive.done ? t('milestones.golive.statusReady') : t('milestones.golive.statusPending')}
              </p>

              {/* J6 — the go-live panel: per-class/coach visibility + the share links. */}
              <div className="mt-3">
                <Cta href={`/${locale}/publish`} label={t('milestones.golive.manage')} testid="milestone-golive-cta" isRTL={isRTL} />
              </div>

              {slug && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ShareableLink
                    path={`/${locale}?gym=${encodeURIComponent(slug)}`}
                    label={t('milestones.golive.landingLabel')}
                    copyLabel={t('milestones.golive.copy')}
                    copiedLabel={t('milestones.golive.copied')}
                    shareMessage={t('milestones.golive.shareText')}
                    shareLabel={t('milestones.golive.share')}
                    testid="golive-landing"
                  />
                  <ShareableLink
                    path={`/${locale}/auth/login`}
                    label={t('milestones.golive.loginLabel')}
                    copyLabel={t('milestones.golive.copy')}
                    copiedLabel={t('milestones.golive.copied')}
                    testid="golive-login"
                  />
                </div>
              )}

              {slug && (
                <a
                  href={`/${locale}?gym=${encodeURIComponent(slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="golive-preview"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
                >
                  {t('milestones.golive.preview')} <ArrowUpRight className={cn('h-4 w-4', isRTL && 'rotate-90')} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Arrow({ isRTL }: { isRTL: boolean }) {
  return <ArrowRight className={cn('h-4 w-4', isRTL && 'rotate-180')} />
}

function Cta({ href, label, testid, isRTL }: { href: string; label: string; testid: string; isRTL: boolean }) {
  return (
    <Link
      href={href}
      data-testid={testid}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-700"
    >
      {label} <Arrow isRTL={isRTL} />
    </Link>
  )
}

function SubLink({ href, label, testid, isRTL }: { href: string; label: string; testid: string; isRTL: boolean }) {
  return (
    <Link
      href={href}
      data-testid={testid}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
    >
      {label} <Arrow isRTL={isRTL} />
    </Link>
  )
}

function DoneChip({ label }: { label: string }) {
  return (
    <span
      data-testid="milestone-done-chip"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
    >
      <Check className="h-3 w-3" /> {label}
    </span>
  )
}

/** The shared card chrome for M1–M5 (icon tile, title + done chip, description, CTA slot). */
function MilestoneCard({
  mKey,
  done,
  icon: Icon,
  title,
  desc,
  doneLabel,
  isRTL,
  children,
}: {
  mKey: MilestoneKey
  done: boolean
  icon: LucideIcon
  title: string
  desc: string
  doneLabel: string
  isRTL: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      data-testid={`milestone-${mKey}`}
      data-done={done}
      className={cn(
        'rounded-2xl border p-4 shadow-sm transition-colors',
        done ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-white',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            done ? 'bg-green-600 text-primary-foreground' : 'bg-[#cd1419]/10 text-primary-600',
          )}
        >
          {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={cn('font-semibold text-gray-900', isRTL && 'font-arabic')}>{title}</p>
            {done && <DoneChip label={doneLabel} />}
          </div>
          <p className={cn('mt-0.5 text-sm text-gray-500', isRTL && 'font-arabic')}>{desc}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  )
}
