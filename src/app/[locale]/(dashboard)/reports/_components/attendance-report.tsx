'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Users, CheckCircle, XCircle, Clock, Download } from 'lucide-react';

interface Props {
  data: { records: any[] } | null;
  locale: string;
}

const STATUS_BADGE: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  late: 'bg-yellow-100 text-yellow-700',
  excused: 'bg-blue-100 text-blue-700',
};

const STATUS_LABELS: Record<string, { ar: string; en: string; fr: string }> = {
  present: { ar: 'حاضر', en: 'Present', fr: 'Présent' },
  absent: { ar: 'غائب', en: 'Absent', fr: 'Absent' },
  late: { ar: 'متأخر', en: 'Late', fr: 'En retard' },
  excused: { ar: 'معذور', en: 'Excused', fr: 'Excusé' },
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

function resolveClassName(cls: any, locale: string): string {
  const c = Array.isArray(cls) ? cls[0] : cls;
  if (!c) return 'Unknown';
  if (locale === 'ar') return c.name_ar || c.name_en || '';
  if (locale === 'fr') return c.name_fr || c.name_en || '';
  return c.name_en || '';
}

export function AttendanceReport({ data, locale }: Props) {
  const t = useTranslations('reportsDashboard');
  const isRTL = locale === 'ar';
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const records = data?.records || [];

  const filteredRecords = useMemo(() => {
    if (!dateFrom && !dateTo) return records;
    return records.filter((r: any) => {
      if (dateFrom && r.attendance_date < dateFrom) return false;
      if (dateTo && r.attendance_date > dateTo) return false;
      return true;
    });
  }, [records, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter((r: any) => r.status === 'present').length;
    const absent = filteredRecords.filter((r: any) => r.status === 'absent').length;
    const late = filteredRecords.filter((r: any) => r.status === 'late').length;
    return {
      total,
      present,
      absent,
      late,
      presentPct: total > 0 ? Math.round((present / total) * 100) : 0,
      absentPct: total > 0 ? Math.round((absent / total) * 100) : 0,
      latePct: total > 0 ? Math.round((late / total) * 100) : 0,
    };
  }, [filteredRecords]);

  const handleExportCSV = useCallback(() => {
    const headers = [t('attendance.student'), t('attendance.class'), t('attendance.date'), t('attendance.status')];
    const rows = filteredRecords.map((r: any) => [
      resolveName(r, locale),
      resolveClassName(r.classes, locale),
      r.attendance_date,
      isRTL ? STATUS_LABELS[r.status]?.ar || r.status : STATUS_LABELS[r.status]?.en || r.status,
    ]);
    const csv = [headers.join(','), ...rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRecords, locale, isRTL, dateFrom, dateTo, t]);

  if (!data) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-gray-500">{t('attendance.noData')}</p>
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
              <label className="text-xs font-medium text-gray-500">{t('attendance.from')}</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{t('attendance.to')}</label>
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
            <CardTitle className="text-sm font-medium text-gray-600">{t('attendance.totalRecords')}</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-600">{t('attendance.present')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{stats.present}</div>
            <p className="text-xs text-green-500">{stats.presentPct}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-600">{t('attendance.absent')}</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{stats.absent}</div>
            <p className="text-xs text-red-500">{stats.absentPct}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">{t('attendance.late')}</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{stats.late}</div>
            <p className="text-xs text-yellow-500">{stats.latePct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>
            {t('attendance.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('attendance.student')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('attendance.class')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('attendance.date')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('attendance.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                      {t('attendance.noRecords')}
                    </td>
                  </tr>
                ) : filteredRecords.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{resolveName(r, locale)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{resolveClassName(r.classes, locale)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.attendance_date}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={cn('text-xs font-medium', STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600')}>
                        {isRTL ? STATUS_LABELS[r.status]?.ar || r.status
                          : locale === 'fr' ? STATUS_LABELS[r.status]?.fr || r.status
                          : STATUS_LABELS[r.status]?.en || r.status}
                      </Badge>
                    </td>
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
