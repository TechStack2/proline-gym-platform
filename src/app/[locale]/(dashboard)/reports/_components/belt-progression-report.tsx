'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Award, TrendingUp, Layers, Download, ArrowRight } from 'lucide-react';

interface Props {
  data: { promotions: any[] } | null;
  locale: string;
}

const BELT_COLORS: Record<string, string> = {
  white: 'bg-white border-2 border-gray-300 text-gray-700',
  yellow: 'bg-yellow-400 text-white',
  orange: 'bg-orange-500 text-white',
  green: 'bg-green-500 text-white',
  blue: 'bg-blue-500 text-white',
  purple: 'bg-purple-500 text-white',
  brown: 'bg-amber-700 text-white',
  black_1: 'bg-black text-white ring-1 ring-red-500',
  black_2: 'bg-black text-white ring-1 ring-red-500',
  black_3: 'bg-black text-white ring-1 ring-red-500',
};

const BELT_LABELS: Record<string, { ar: string; en: string; fr: string }> = {
  white: { ar: 'أبيض', en: 'White', fr: 'Blanche' },
  yellow: { ar: 'أصفر', en: 'Yellow', fr: 'Jaune' },
  orange: { ar: 'برتقالي', en: 'Orange', fr: 'Orange' },
  green: { ar: 'أخضر', en: 'Green', fr: 'Verte' },
  blue: { ar: 'أزرق', en: 'Blue', fr: 'Bleue' },
  purple: { ar: 'أرجواني', en: 'Purple', fr: 'Violette' },
  brown: { ar: 'بني', en: 'Brown', fr: 'Marron' },
  black_1: { ar: 'أسود دان 1', en: 'Black 1st Dan', fr: 'Noire 1er Dan' },
  black_2: { ar: 'أسود دان 2', en: 'Black 2nd Dan', fr: 'Noire 2e Dan' },
  black_3: { ar: 'أسود دان 3', en: 'Black 3rd Dan', fr: 'Noire 3e Dan' },
};

function getBeltColor(rank: string): string {
  return BELT_COLORS[rank] || 'bg-gray-100 text-gray-700';
}

function getBeltLabel(rank: string, locale: string): string {
  return BELT_LABELS[rank]?.[locale as 'ar' | 'en' | 'fr'] || rank;
}

function resolveName(row: any, locale: string): string {
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  const profile = student?.profiles;
  const p = Array.isArray(profile) ? profile[0] : profile;
  if (!p) return 'Unknown';
  if (locale === 'ar') return [p.first_name_ar, p.last_name_ar].filter(Boolean).join(' ') || p.first_name_en || '';
  if (locale === 'fr') return [p.first_name_fr || p.first_name_en, p.last_name_fr || p.last_name_en].filter(Boolean).join(' ') || '';
  return [p.first_name_en, p.last_name_en].filter(Boolean).join(' ') || '';
}

function resolveDiscipline(discipline: any, locale: string): string {
  const d = Array.isArray(discipline) ? discipline[0] : discipline;
  if (!d) return 'Unknown';
  if (locale === 'ar') return d.name_ar || d.name_en || '';
  if (locale === 'fr') return d.name_fr || d.name_en || '';
  return d.name_en || '';
}

export function BeltProgressionReport({ data, locale }: Props) {
  const t = useTranslations('reportsDashboard');
  const isRTL = locale === 'ar';
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const promotions = data?.promotions || [];

  const filteredPromotions = useMemo(() => {
    return promotions.filter((p: any) => {
      if (dateFrom && p.promotion_date < dateFrom) return false;
      if (dateTo && p.promotion_date > dateTo) return false;
      return true;
    });
  }, [promotions, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filteredPromotions.length;
    const byDiscipline: Record<string, number> = {};
    const byBelt: Record<string, number> = {};
    filteredPromotions.forEach((p: any) => {
      const disc = Array.isArray(p.disciplines) ? p.disciplines[0] : p.disciplines;
      const discName = resolveDiscipline(disc, locale);
      byDiscipline[discName] = (byDiscipline[discName] || 0) + 1;
      byBelt[p.to_rank] = (byBelt[p.to_rank] || 0) + 1;
    });
    return { total, byDiscipline: Object.entries(byDiscipline).sort(([, a], [, b]) => b - a), byBelt: Object.entries(byBelt).sort(([, a], [, b]) => b - a) };
  }, [filteredPromotions, locale]);

  const handleExportCSV = useCallback(() => {
    const headers = [t('belts.student'), t('belts.discipline'), t('belts.from'), t('belts.to'), t('belts.date')];
    const rows = filteredPromotions.map((p: any) => [
      resolveName(p, locale),
      resolveDiscipline(p.disciplines, locale),
      p.from_rank ? getBeltLabel(p.from_rank, 'en') : '—',
      getBeltLabel(p.to_rank, 'en'),
      p.promotion_date,
    ]);
    const csv = [headers.join(','), ...rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belt-progression-report-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredPromotions, locale, dateFrom, dateTo, t]);

  if (!data) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-gray-500">{t('belts.noData')}</p>
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
              <label className="text-xs font-medium text-gray-500">{t('belts.from')}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{t('belts.to')}</label>
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
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t('belts.totalPromotions')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary-600">{t('belts.byDiscipline')}</CardTitle>
            <Layers className="h-4 w-4 text-primary-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats.byDiscipline.slice(0, 3).map(([name, count]) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate mr-2">{name}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {stats.byDiscipline.length === 0 && <p className="text-sm text-gray-400">—</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">{t('belts.byBeltRank')}</CardTitle>
            <Award className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats.byBelt.slice(0, 3).map(([rank, count]) => (
                <div key={rank} className="flex justify-between text-sm">
                  <Badge className={cn('text-xs font-medium', getBeltColor(rank))}>
                    {getBeltLabel(rank, locale)}
                  </Badge>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {stats.byBelt.length === 0 && <p className="text-sm text-gray-400">—</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Promotions Table */}
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>
            {t('belts.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('belts.student')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('belts.discipline')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('belts.fromTo')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('belts.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPromotions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                      {t('belts.noPromotions')}
                    </td>
                  </tr>
                ) : filteredPromotions.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{resolveName(p, locale)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{resolveDiscipline(p.disciplines, locale)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {p.from_rank ? (
                          <Badge className={cn('text-xs font-medium', getBeltColor(p.from_rank))}>
                            {getBeltLabel(p.from_rank, locale)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400 italic">{t('belts.start')}</span>
                        )}
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <Badge className={cn('text-xs font-medium', getBeltColor(p.to_rank))}>
                          {getBeltLabel(p.to_rank, locale)}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{p.promotion_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
