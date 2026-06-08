'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { AttendanceReport } from './attendance-report';
import { RevenueReport } from './revenue-report';
import { BeltProgressionReport } from './belt-progression-report';
import { FileSpreadsheet, DollarSign, Award } from 'lucide-react';

interface Props {
  locale: string;
}

type TabKey = 'attendance' | 'revenue' | 'belts';

const TAB_ICONS: Record<TabKey, typeof FileSpreadsheet> = {
  attendance: FileSpreadsheet,
  revenue: DollarSign,
  belts: Award,
};

export function ReportsTabs({ locale }: Props) {
  const t = useTranslations('reportsDashboard');
  const isRTL = locale === 'ar';
  const [activeTab, setActiveTab] = useState<TabKey>('attendance');
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const TAB_LABELS: Record<TabKey, string> = {
    attendance: t('tabs.attendance'),
    revenue: t('tabs.revenue'),
    belts: t('tabs.beltProgression'),
  };

  const fetchData = useCallback(async (tab: TabKey) => {
    setLoading(true);
    const supabase = createClient();
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    try {
      if (tab === 'attendance') {
        const { data: records } = await supabase
          .from('attendance_records')
          .select(`
            id, attendance_date, status,
            classes:class_id (name_en, name_ar, name_fr),
            students:student_id (
              id,
              profiles:profile_id (first_name_en, first_name_ar, first_name_fr, last_name_en, last_name_ar, last_name_fr)
            )
          `)
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate)
          .order('attendance_date', { ascending: false })
          .limit(200);
        setData({ records: records || [] });
      } else if (tab === 'revenue') {
        const [{ data: invoices }, { data: payments }] = await Promise.all([
          supabase.from('invoices').select('*').gte('created_at', startDate).lte('created_at', endDate).order('created_at', { ascending: false }).limit(200),
          supabase.from('payments').select(`
            id, amount_usd, amount_lbp, payment_method, payment_date, reference_number,
            invoices:invoice_id (invoice_type, invoice_number, amount_usd, total_usd),
            students:student_id (
              id,
              profiles:profile_id (first_name_en, first_name_ar, first_name_fr, last_name_en, last_name_ar, last_name_fr)
            )
          `).gte('payment_date', startDate).lte('payment_date', endDate).order('payment_date', { ascending: false }).limit(200),
        ]);
        setData({ invoices: invoices || [], payments: payments || [] });
      } else if (tab === 'belts') {
        const { data: promotions } = await supabase
          .from('belt_promotions')
          .select(`
            id, from_rank, to_rank, promotion_date, notes_en, notes_ar, notes_fr,
            students:student_id (
              id,
              profiles:profile_id (first_name_en, first_name_ar, first_name_fr, last_name_en, last_name_ar, last_name_fr)
            ),
            disciplines:discipline_id (name_en, name_ar, name_fr),
            belt_hierarchy:belt_hierarchy_id (name_en, name_ar, name_fr, rank)
          `)
          .gte('promotion_date', startDate)
          .lte('promotion_date', endDate)
          .order('promotion_date', { ascending: false })
          .limit(200);
        setData({ promotions: promotions || [] });
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mounted) {
      fetchData(activeTab);
    }
  }, [activeTab, mounted, fetchData]);

  if (!mounted) {
    return <div className="animate-pulse h-96 bg-gray-100 rounded-2xl" />;
  }

  return (
    <div className="space-y-6">
      {/* Tab Bar */}
      <div className="flex gap-1 border-b pb-2 overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
        {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => {
          const Icon = TAB_ICONS[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors',
                activeTab === tab
                  ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              <Icon className="h-4 w-4" />
              {TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
      ) : (
        <>
          {activeTab === 'attendance' && <AttendanceReport data={data} locale={locale} />}
          {activeTab === 'revenue' && <RevenueReport data={data} locale={locale} />}
          {activeTab === 'belts' && <BeltProgressionReport data={data} locale={locale} />}
        </>
      )}
    </div>
  );
}
