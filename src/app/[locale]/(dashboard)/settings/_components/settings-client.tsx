'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  Building2, Swords, Tag, FileText, MessageSquare, Tent, UserCog, BarChart3, Rocket,
  ChevronRight, ChevronLeft, ExternalLink, CalendarDays, GraduationCap, Award,
  type LucideIcon,
} from 'lucide-react';
import { GymSettings } from './gym-settings';
import { LandingPhotosManager } from './landing-photos-manager';
import { ExchangeRates } from './exchange-rates';
import { DisciplineManager } from './discipline-manager';
import { PlanManager } from './plan-manager';
import { BeltLadderManager } from './belt-ladder-manager';
import { PtPackageManager, type PtTypeRow } from './pt-package-manager';
import { PtPolicySettings } from './pt-policy-settings';
import { WhatsAppSettings } from './whatsapp-settings';
import { type WhatsAppStatus } from './whatsapp-actions';
import { WaiverSettings } from './waiver-settings';
import { type WaiverTemplate } from './waiver-actions';

type GymData = Parameters<typeof GymSettings>[0]['gym'];
type ExchangeRate = Parameters<typeof ExchangeRates>[0]['rates'][number];
type MembershipPlan = Record<string, unknown>;
type Discipline = Record<string, unknown>;

// M2-A MANAGE-INDEX: /settings is a card INDEX (no default section). Each card either
// OPENS a section in place (the existing tab content, re-grouped) or LINKS to another
// surface. Legacy `?tab=` deep-links (gym/rates/plans/disciplines/ptpackages/comms) all
// resolve to the right section so the setup-hub CTAs + specs keep working; the new ids
// (offers/documents/messaging) are added only where a card has no legacy tab.
type SectionId = 'gym' | 'disciplines' | 'offers' | 'documents' | 'messaging';

const TAB_TO_SECTION: Record<string, SectionId> = {
  gym: 'gym',
  disciplines: 'disciplines',
  // Offers & pricing groups the three legacy money tabs.
  plans: 'offers', ptpackages: 'offers', rates: 'offers', offers: 'offers',
  documents: 'documents',
  // comms split into Messaging (WhatsApp) + Documents (waiver); g1→messaging, f3→documents.
  messaging: 'messaging', comms: 'messaging',
};

type Props = {
  locale: string;
  gym: GymData;
  rates: ExchangeRate[];
  plans: MembershipPlan[];
  disciplines: Discipline[];
  ptTypes: PtTypeRow[];
  whatsappStatus: WhatsAppStatus;
  waiverTemplate: WaiverTemplate;
  ptNoShowForfeits: boolean;
  ptLateCancelWindowHours: number;
  /** NO-MEMBERSHIP-GAPS: false hides the plan manager inside the Offers section. */
  showMembership?: boolean;
  /** products.camp — hides the Camps card entirely for a gym that doesn't run camps. */
  showCamps?: boolean;
  /** LIVE chip (head:true count, gym-scoped) — the only new query M2-A adds. */
  campsCount?: number;
  /** M2-E CLASS-HOME: LIVE Classes chip — total active classes · how many on the public page. */
  classesCount?: number;
  classesOnLandingCount?: number;
  /** COMPLETENESS R3: how many live classes are half-configured (no schedule / inactive coach). */
  incompleteClassesCount?: number;
};

type ChipTone = 'ready' | 'todo' | 'neutral';
function Chip({ tone, children, testid = 'settings-card-chip' }: { tone: ChipTone; children: React.ReactNode; testid?: string }) {
  // W3b §2.3: role-hue tints (dark-correct) instead of light-pinned -50 fills.
  const styles: Record<ChipTone, string> = {
    ready: 'tint-success border-success-500/30',
    todo: 'tint-warning border-warning-500/30',
    neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span data-testid={testid} className={cn('shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium', styles[tone])}>
      {children}
    </span>
  );
}

export function SettingsClient({
  locale, gym, rates, plans, disciplines, ptTypes, initialTab,
  whatsappStatus, waiverTemplate, ptNoShowForfeits, ptLateCancelWindowHours,
  showMembership = true, showCamps = true, campsCount = 0,
  classesCount = 0, classesOnLandingCount = 0, incompleteClassesCount = 0,
}: Props & { initialTab?: string }) {
  const t = useTranslations('settings');
  const isRTL = locale === 'ar';
  const [section, setSection] = useState<SectionId | null>(
    initialTab && TAB_TO_SECTION[initialTab] ? TAB_TO_SECTION[initialTab] : null,
  );

  // ── LIVE chips, derived from data the page already fetched (zero extra queries) ──
  const branded = !!(gym?.logo_url || gym?.brand_color || gym?.hero_image_url);
  const disciplineCount = disciplines.length;
  const planCount = plans.length;
  const ptCount = ptTypes.length;
  const waiverV = waiverTemplate?.version ?? null;
  const waConfigured = whatsappStatus?.configured ?? false;
  const Back = isRTL ? ChevronRight : ChevronLeft;
  const Fwd = isRTL ? ChevronLeft : ChevronRight;

  // ── SECTION DETAIL ──
  if (section) {
    const TITLES: Record<SectionId, string> = {
      gym: t('manage.cards.gym.title'),
      disciplines: t('manage.cards.programs.title'),
      offers: t('manage.cards.offers.title'),
      documents: t('manage.cards.documents.title'),
      messaging: t('manage.cards.messaging.title'),
    };
    return (
      <div className="space-y-4">
        <button
          type="button"
          data-testid="settings-back"
          onClick={() => setSection(null)}
          className={cn('inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800', isRTL && 'font-arabic')}
        >
          <Back className="h-4 w-4" /> {t('manage.back')}
        </button>
        <h2 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')} data-testid={`settings-section-${section}`}>
          {TITLES[section]}
        </h2>

        {section === 'gym' && (
          <div className="space-y-4">
            <GymSettings gym={gym} locale={locale} />
            {/* M2-C GALLERY: the "Public page photos" manager lives in this section. */}
            {gym?.id && <LandingPhotosManager gymId={gym.id} locale={locale} />}
          </div>
        )}

        {section === 'offers' && gym?.id && (
          <div className="space-y-4">
            {showMembership && <PlanManager plans={plans as any} gymId={gym.id} locale={locale} />}
            <PtPackageManager types={ptTypes} disciplines={(disciplines as any[]).filter((d: any) => d.is_active !== false)} gymId={gym.id} locale={locale} />
            <PtPolicySettings locale={locale} gymId={gym.id} noShowForfeits={ptNoShowForfeits} lateCancelWindowHours={ptLateCancelWindowHours} />
            <ExchangeRates rates={rates} locale={locale} />
          </div>
        )}

        {section === 'disciplines' && (
          <div className="space-y-4">
            {gym?.id && <DisciplineManager disciplines={disciplines as any} gymId={gym.id} locale={locale} />}
            <BeltLadderManager disciplines={disciplines as any} locale={locale} />
            {/* Entry links out of Settings: class CRUD, the weekly timetable, and the
                belt-PROMOTION engine (distinct from the "Belt ladders" config above). */}
            <div className="grid gap-2 sm:grid-cols-3">
              <SubLink href={`/${locale}/classes`} icon={GraduationCap} label={t('manage.links.classes')} isRTL={isRTL} />
              <SubLink href={`/${locale}/schedule`} icon={CalendarDays} label={t('manage.links.schedule')} isRTL={isRTL} />
              <SubLink href={`/${locale}/belts`} icon={Award} label={t('manage.links.promotions')} isRTL={isRTL} />
            </div>
          </div>
        )}

        {section === 'documents' && <WaiverSettings initial={waiverTemplate} locale={locale} />}
        {section === 'messaging' && <WhatsAppSettings initial={whatsappStatus} locale={locale} />}
      </div>
    );
  }

  // ── CARD INDEX ──
  // One ordered list of index entries: SECTION cards open in place, LINK cards navigate.
  // M2-E CLASS-HOME: Classes sits right after Programs — it was reachable only via
  // Schedule before, yet class registration (not membership) is how members sign up.
  const cardKey: Record<SectionId, string> = {
    gym: 'gym', disciplines: 'programs', offers: 'offers', documents: 'documents', messaging: 'messaging',
  };

  type IndexEntry =
    | { kind: 'section'; id: SectionId; icon: LucideIcon; chip: React.ReactNode }
    | { kind: 'link'; id: string; icon: LucideIcon; href: string; chip?: React.ReactNode };

  const entries: IndexEntry[] = [
    {
      kind: 'section', id: 'gym', icon: Building2,
      chip: branded ? <Chip tone="ready">{t('manage.chips.ready')}</Chip> : <Chip tone="todo">{t('manage.chips.addBranding')}</Chip>,
    },
    {
      kind: 'section', id: 'disciplines', icon: Swords,
      chip: disciplineCount > 0
        ? <Chip tone="ready">{t('manage.chips.ready')}</Chip>
        : <Chip tone="todo">{t('manage.chips.addDisciplines')}</Chip>,
    },
    // M2-E: Classes card (links to the classes surface). Live chip = N classes · M on page.
    {
      kind: 'link', id: 'classes', icon: GraduationCap, href: `/${locale}/classes`,
      // COMPLETENESS R3: when some live classes are half-configured, the Manage card
      // warns "N need setup" instead of the celebratory count — a one-tap route to fix.
      chip: classesCount > 0
        ? (incompleteClassesCount > 0
            ? <Chip tone="todo" testid="settings-classes-incomplete">{t('manage.chips.classesIncomplete', { n: incompleteClassesCount })}</Chip>
            : <Chip tone="ready">{t('manage.chips.classesCount', { n: classesCount, m: classesOnLandingCount })}</Chip>)
        : <Chip tone="todo">{t('manage.chips.addClasses')}</Chip>,
    },
    {
      kind: 'section', id: 'offers', icon: Tag,
      chip: (planCount > 0 || ptCount > 0)
        ? <Chip tone="ready">{t('manage.chips.ready')}</Chip>
        : <Chip tone="todo">{t('manage.chips.setup')}</Chip>,
    },
    {
      kind: 'section', id: 'documents', icon: FileText,
      chip: waiverV != null ? <Chip tone="ready">{t('manage.chips.waiver', { v: waiverV })}</Chip> : <Chip tone="todo">{t('manage.chips.waiverNone')}</Chip>,
    },
    {
      kind: 'section', id: 'messaging', icon: MessageSquare,
      chip: waConfigured ? <Chip tone="ready">{t('manage.chips.connected')}</Chip> : <Chip tone="neutral">{t('manage.chips.notConnected')}</Chip>,
    },
    ...(showCamps ? [{
      kind: 'link' as const, id: 'camps', icon: Tent, href: `/${locale}/camps`,
      chip: campsCount > 0 ? <Chip tone="neutral">{t('manage.chips.active')}</Chip> : undefined,
    }] : []),
    { kind: 'link', id: 'team', icon: UserCog, href: `/${locale}/coaches` },
    { kind: 'link', id: 'reports', icon: BarChart3, href: `/${locale}/reports` },
    { kind: 'link', id: 'golive', icon: Rocket, href: `/${locale}/publish` },
  ];

  const cardClass = 'group flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-start shadow-sm transition-colors hover:border-gray-200 hover:bg-gray-50';

  return (
    <div className="space-y-4" data-testid="settings-index">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => {
          const Icon = entry.icon;
          if (entry.kind === 'section') {
            const k = cardKey[entry.id];
            return (
              <button key={entry.id} type="button" data-testid={`settings-card-${entry.id}`} onClick={() => setSection(entry.id)} className={cardClass}>
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t(`manage.cards.${k}.title` as Parameters<typeof t>[0])}</span>
                    {entry.chip}
                  </span>
                  <span className={cn('mt-0.5 block text-xs text-gray-500', isRTL && 'font-arabic')}>{t(`manage.cards.${k}.desc` as Parameters<typeof t>[0])}</span>
                </span>
                <Fwd className="mt-1 h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-400" />
              </button>
            );
          }
          return (
            <Link key={entry.id} href={entry.href} data-testid={`settings-card-${entry.id}`} className={cardClass}>
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t(`manage.cards.${entry.id}.title` as Parameters<typeof t>[0])}</span>
                  {entry.chip}
                </span>
                <span className={cn('mt-0.5 block text-xs text-gray-500', isRTL && 'font-arabic')}>{t(`manage.cards.${entry.id}.desc` as Parameters<typeof t>[0])}</span>
              </span>
              <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SubLink({ href, icon: Icon, label, isRTL }: { href: string; icon: LucideIcon; label: string; isRTL: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
      <Icon className="h-4 w-4 text-primary-600" />
      <span className={cn('flex-1', isRTL && 'font-arabic')}>{label}</span>
      <ExternalLink className="h-3.5 w-3.5 text-gray-300" />
    </Link>
  );
}
