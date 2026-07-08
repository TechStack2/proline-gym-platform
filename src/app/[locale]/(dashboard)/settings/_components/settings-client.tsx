'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Building2, TrendingUp, CreditCard, Swords, Dumbbell, MessageSquare } from 'lucide-react';
import { GymSettings } from './gym-settings';
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
// J5 SETTINGS-REFIT: the legacy read-only MembershipPlans/DisciplineSettings blocks
// (that these types were derived from) are removed — the editor managers own each tab
// now. The rows are supabase select('*') results handed to the managers via `as any`,
// so a permissive row type is both truthful and non-rippling.
type MembershipPlan = Record<string, unknown>;
type Discipline = Record<string, unknown>;

// J5b SETTINGS-IA: one coherent page — every card lives in exactly ONE tab. `comms`
// (Messaging & Docs) is new; it homes the WhatsApp + waiver cards that used to render
// under EVERY tab. PT Session Policy moved under the ptpackages tab; the interface-
// language switcher into Gym Profile. Preserved ids gym/rates/plans/disciplines/
// ptpackages keep the checklist + setup-hub deep-links working.
type TabId = 'gym' | 'rates' | 'plans' | 'disciplines' | 'ptpackages' | 'comms';

type Props = {
  locale: string;
  gym: GymData;
  rates: ExchangeRate[];
  plans: MembershipPlan[];
  disciplines: Discipline[];
  ptTypes: PtTypeRow[];
  // The WhatsApp + waiver cards now render inside the comms tab (page.tsx still
  // fetches both in its parallel wave and threads them here).
  whatsappStatus: WhatsAppStatus;
  waiverTemplate: WaiverTemplate;
  // PT Session Policy (ptpackages tab) — the two fields ride on the gyms row.
  ptNoShowForfeits: boolean;
  ptLateCancelWindowHours: number;
  /** NO-MEMBERSHIP-GAPS: false hides the membership-plans tab entirely. */
  showMembership?: boolean;
};

export function SettingsClient({
  locale, gym, rates, plans, disciplines, ptTypes, initialTab,
  whatsappStatus, waiverTemplate, ptNoShowForfeits, ptLateCancelWindowHours,
  showMembership = true,
}: Props & { initialTab?: string }) {
  const t = useTranslations('settings');
  // NO-MEMBERSHIP-GAPS: with membership off, the plans tab neither renders nor is
  // deep-linkable (?tab=plans falls back to gym).
  const availableTabs: TabId[] = (['gym', 'rates', 'plans', 'disciplines', 'ptpackages', 'comms'] as TabId[])
    .filter((tab) => tab !== 'plans' || showMembership);
  const [activeTab, setActiveTab] = useState<TabId>(
    availableTabs.includes(initialTab as TabId) ? (initialTab as TabId) : 'gym'
  );
  const isRTL = locale === 'ar';

  const TAB_LABELS: Record<TabId, string> = {
    gym: t('tabs.gymProfile'),
    rates: t('tabs.exchangeRates'),
    plans: t('tabs.membershipPlans'),
    disciplines: t('tabs.disciplinesBelts'),
    ptpackages: t('tabs.personalTraining'),
    comms: t('tabs.comms'),
  };

  const TAB_ICONS: Record<TabId, React.ReactNode> = {
    gym: <Building2 className="h-4 w-4" />,
    rates: <TrendingUp className="h-4 w-4" />,
    plans: <CreditCard className="h-4 w-4" />,
    disciplines: <Swords className="h-4 w-4" />,
    ptpackages: <Dumbbell className="h-4 w-4" />,
    comms: <MessageSquare className="h-4 w-4" />,
  };

  const tabIds: TabId[] = availableTabs;

  return (
    <div className="space-y-4">
      {/* Tab Bar — the ONLY navigation for settings (J5b: the quick-chips row is gone). */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto">
        {tabIds.map(tab => (
          <button
            key={tab}
            data-testid={`settings-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0',
              isRTL && 'font-arabic',
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {TAB_ICONS[tab]}
            <span className="hidden sm:inline">{TAB_LABELS[tab]}</span>
          </button>
        ))}
      </div>

      {/* Tab Content — exactly one home per card */}
      <div>
        {activeTab === 'gym' && <GymSettings gym={gym} locale={locale} />}
        {activeTab === 'rates' && <ExchangeRates rates={rates} locale={locale} />}
        {activeTab === 'plans' && showMembership && gym?.id && (
          <PlanManager plans={plans as any} gymId={gym.id} locale={locale} />
        )}
        {activeTab === 'ptpackages' && gym?.id && (
          <div className="space-y-4">
            <PtPackageManager types={ptTypes} disciplines={(disciplines as any[]).filter((d: any) => d.is_active !== false)} gymId={gym.id} locale={locale} />
            {/* PT Session Policy — re-homed here (was rendered under every tab). */}
            <PtPolicySettings
              locale={locale}
              gymId={gym.id}
              noShowForfeits={ptNoShowForfeits}
              lateCancelWindowHours={ptLateCancelWindowHours}
            />
          </div>
        )}
        {activeTab === 'disciplines' && (
          <>
            {gym?.id && <DisciplineManager disciplines={disciplines as any} gymId={gym.id} locale={locale} />}
            <BeltLadderManager disciplines={disciplines as any} locale={locale} />
          </>
        )}
        {activeTab === 'comms' && (
          <div className="space-y-4">
            {/* Messaging & Docs — WhatsApp config + the liability waiver, re-homed here. */}
            <WhatsAppSettings initial={whatsappStatus} locale={locale} />
            <WaiverSettings initial={waiverTemplate} locale={locale} />
          </div>
        )}
      </div>
    </div>
  );
}
