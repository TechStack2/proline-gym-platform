import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { ReportsTabs } from './_components/reports-tabs';
import { cn } from '@/lib/utils';

type Props = {
  params: { locale: string };
};

export default async function ReportsPage({ params }: Props) {
  const { locale } = params;
  const t = await getTranslations('reportsDashboard');
  const isRTL = locale === 'ar';

  return (
    <div className="space-y-6">
      {/* Breadcrumb Nav */}
      <nav className="flex items-center gap-2 text-sm text-gray-400">
        <a href={`/${locale}/dashboard`} className="hover:text-primary-600 transition-colors">
          {isRTL ? 'لوحة التحكم' : locale === 'fr' ? 'Tableau de bord' : 'Dashboard'}
        </a>
        <span>/</span>
        <span className="text-gray-700 font-medium">
          {t('title')}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* Tabs + Report Content */}
      <Suspense fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-2xl" />}>
        <ReportsTabs locale={locale} />
      </Suspense>
    </div>
  );
}
