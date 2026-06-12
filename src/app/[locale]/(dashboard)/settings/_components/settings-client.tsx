'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Building2, TrendingUp, CreditCard, Swords, Dumbbell } from 'lucide-react';
import { GymSettings } from './gym-settings';
import { ExchangeRates } from './exchange-rates';
import { MembershipPlans } from './membership-plans';
import { DisciplineSettings } from './discipline-settings';
import { DisciplineManager } from './discipline-manager';
import { PtPackageManager, type PtTypeRow } from './pt-package-manager';

type GymData = Parameters<typeof GymSettings>[0]['gym'];
type ExchangeRate = Parameters<typeof ExchangeRates>[0]['rates'][number];
type MembershipPlan = Parameters<typeof MembershipPlans>[0]['plans'][number];
type Discipline = Parameters<typeof DisciplineSettings>[0]['disciplines'][number];

type TabId = 'gym' | 'rates' | 'plans' | 'disciplines' | 'ptpackages';

type Props = {
  locale: string;
  gym: GymData;
  rates: ExchangeRate[];
  plans: MembershipPlan[];
  disciplines: Discipline[];
  ptTypes: PtTypeRow[];
};

export function SettingsClient({ locale, gym, rates, plans, disciplines, ptTypes, initialTab }: Props & { initialTab?: string }) {
  const t = useTranslations('settings');
  const [activeTab, setActiveTab] = useState<TabId>(
    (['gym', 'rates', 'plans', 'disciplines', 'ptpackages'] as TabId[]).includes(initialTab as TabId) ? (initialTab as TabId) : 'gym'
  );
  const isRTL = locale === 'ar';

  const TAB_LABELS: Record<TabId, string> = {
    gym: t('tabs.gymProfile'),
    rates: t('tabs.exchangeRates'),
    plans: t('tabs.membershipPlans'),
    disciplines: t('tabs.disciplinesBelts'),
    ptpackages: t('tabs.ptPackages'),
  };

  const TAB_ICONS: Record<TabId, React.ReactNode> = {
    gym: <Building2 className="h-4 w-4" />,
    rates: <TrendingUp className="h-4 w-4" />,
    plans: <CreditCard className="h-4 w-4" />,
    disciplines: <Swords className="h-4 w-4" />,
    ptpackages: <Dumbbell className="h-4 w-4" />,
  };

  const tabIds: TabId[] = ['gym', 'rates', 'plans', 'disciplines', 'ptpackages'];

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto">
        {tabIds.map(tab => (
          <button
            key={tab}
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

      {/* Tab Content */}
      <div>
        {activeTab === 'gym' && <GymSettings gym={gym} locale={locale} />}
        {activeTab === 'rates' && <ExchangeRates rates={rates} locale={locale} />}
        {activeTab === 'plans' && <MembershipPlans plans={plans} locale={locale} />}
        {activeTab === 'ptpackages' && gym?.id && (
          <PtPackageManager types={ptTypes} disciplines={(disciplines as any[]).filter((d: any) => d.is_active !== false)} gymId={gym.id} locale={locale} />
        )}
        {activeTab === 'disciplines' && (
          <>
            {gym?.id && <DisciplineManager disciplines={disciplines as any} gymId={gym.id} locale={locale} />}
            <DisciplineSettings disciplines={disciplines} locale={locale} />
          </>
        )}
      </div>
    </div>
  );
}
