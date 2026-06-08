'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DollarSign, TrendingUp, AlertCircle, CheckCircle, Download } from 'lucide-react';

interface Props {
  data: { invoices: any[]; payments: any[] } | null;
  locale: string;
}

const INVOICE_TYPE_LABELS: Record<string, { ar: string; en: string; fr: string }> = {
  membership: { ar: 'عضوية', en: 'Membership', fr: 'Abonnement' },
  pt_package: { ar: 'باقة PT', en: 'PT Package', fr: 'Pack PT' },
  pt_session: { ar: 'جلسة PT', en: 'PT Session', fr: 'Séance PT' },
  camp: { ar: 'مخيم', en: 'Camp', fr: 'Camp' },
  rental: { ar: 'إيجار', en: 'Rental', fr: 'Location' },
  event: { ar: 'حدث', en: 'Event', fr: 'Événement' },
  other: { ar: 'أخرى', en: 'Other', fr: 'Autre' },
};

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  refunded: 'bg-purple-100 text-purple-700',
  partial: 'bg-blue-100 text-blue-700',
};

function resolveName(row: any, locale: string): string {
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  const profile = student?.profiles;
  const p = Array.isArray(profile) ? profile[0] : profile;
  if (!p) return 'Unknown';
  if (locale === 'ar') return [p.first_name_ar, p.last_name_ar].filter(Boolean).join(' ') || p.first_name_en || '';
  if (locale === 'fr') return [p.first_name_fr || p.first_name_en, p.last_name_fr || p.last_name_en].filter(Boolean).join(' ') || '';
  return [p.first_name_en, p.last_name_en].filter(Boolean).join(' ') || '';
}

export function RevenueReport({ data, locale }: Props) {
  const t = useTranslations('reportsDashboard');
  const isRTL = locale === 'ar';
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const invoices = data?.invoices || [];
  const payments = data?.payments || [];

  const filteredPayments = useMemo(() => {
    return payments.filter((p: any) => {
      const date = p.payment_date?.split('T')[0] || '';
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    });
  }, [payments, dateFrom, dateTo]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv: any) => {
      const date = inv.created_at?.split('T')[0] || '';
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    });
  }, [invoices, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const totalInvoiced = filteredInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_usd) || 0), 0);
    const totalCollected = filteredPayments.reduce((sum: number, p: any) => sum + (Number(p.amount_usd) || 0), 0);
    const outstanding = totalInvoiced - totalCollected;
    const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;
    return { totalInvoiced, totalCollected, outstanding: Math.max(0, outstanding), collectionRate };
  }, [filteredInvoices, filteredPayments]);

  const revenueByType = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPayments.forEach((p: any) => {
      const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
      const type = inv?.invoice_type || 'other';
      map[type] = (map[type] || 0) + (Number(p.amount_usd) || 0);
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [filteredPayments]);

  const handleExportCSV = useCallback(() => {
    const headers = [t('revenue.student'), t('revenue.amount'), t('revenue.method'), t('revenue.date'), t('revenue.type')];
    const rows = filteredPayments.map((p: any) => {
      const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
      return [
        resolveName(p, locale),
        `$${(Number(p.amount_usd) || 0).toFixed(2)}`,
        p.payment_method || '',
        p.payment_date?.split('T')[0] || '',
        inv?.invoice_type || '',
      ];
    });
    const csv = [headers.join(','), ...rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-report-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredPayments, locale, dateFrom, dateTo, t]);

  if (!data) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-gray-500">{t('revenue.noData')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{t('revenue.from')}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{t('revenue.to')}</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('revenue.totalInvoiced')}</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalInvoiced.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-600">{t('revenue.collected')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">${stats.totalCollected.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-600">{t('revenue.outstanding')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">${stats.outstanding.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">{t('revenue.collectionRate')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{stats.collectionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Type */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>
            {t('revenue.byType')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {revenueByType.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">{t('revenue.noDataMsg')}</p>
            ) : revenueByType.map(([type, amount]) => (
              <div key={type} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium text-gray-700">
                  {isRTL ? INVOICE_TYPE_LABELS[type]?.ar || type
                    : locale === 'fr' ? INVOICE_TYPE_LABELS[type]?.fr || type
                    : INVOICE_TYPE_LABELS[type]?.en || type}
                </span>
                <span className="text-sm font-bold text-gray-900">${amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>
            {t('revenue.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('revenue.student')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('revenue.amount')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('revenue.method')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('revenue.type')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('revenue.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                      {t('revenue.noPayments')}
                    </td>
                  </tr>
                ) : filteredPayments.map((p: any) => {
                  const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{resolveName(p, locale)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">${(Number(p.amount_usd) || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        <Badge className="text-xs bg-gray-100 text-gray-600">{p.payment_method || '—'}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {inv ? (isRTL ? INVOICE_TYPE_LABELS[inv.invoice_type]?.ar || inv.invoice_type
                          : locale === 'fr' ? INVOICE_TYPE_LABELS[inv.invoice_type]?.fr || inv.invoice_type
                          : INVOICE_TYPE_LABELS[inv.invoice_type]?.en || inv.invoice_type) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{p.payment_date?.split('T')[0] || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
