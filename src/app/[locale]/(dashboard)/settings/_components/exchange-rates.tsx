import { fmtDate } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'
import { EmptyState } from '@/components/ui/empty-state'
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CircleDollarSign, Plus, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

type ExchangeRate = {
  id?: string;
  rate: number;
  rate_date: string;
  source?: string;
  notes?: string;
  created_at?: string;
};

type Props = {
  rates: ExchangeRate[];
  locale: string;
};

export function ExchangeRates({ rates, locale }: Props) {
  const t = useTranslations('settings');
  const router = useRouter();
  const isRTL = locale === 'ar';

  // SETTINGS-LIVE: the add-rate form was an inert stub with NO insert path in the
  // app. Controlled fields → the 000075 staff-gated SECURITY DEFINER RPC
  // insert_exchange_rate (FX-PER-GYM: upsert on gym_id+rate_date+source — the RPC
  // stamps the caller's gym_id; re-submitting a day corrects THAT gym's rate).
  const [newRate, setNewRate] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newSource, setNewSource] = useState('manual');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  const saveRate = async () => {
    setSaveError(''); setSavedOk(false);
    const num = parseFloat(newRate);
    if (!Number.isFinite(num) || num <= 0) { setSaveError(t('exchange.invalidRate')); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('insert_exchange_rate', {
      p_rate: num,
      p_rate_date: newDate || new Date().toISOString().split('T')[0],
      p_source: newSource.trim() || 'manual',
    });
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setSavedOk(true);
    setNewRate('');
    setTimeout(() => setSavedOk(false), 2500);
    router.refresh();
  };

  const sortedRates = [...rates].sort(
    (a, b) => new Date(b.rate_date).getTime() - new Date(a.rate_date).getTime()
  );
  const currentRate = sortedRates[0] || null;
  const previousRate = sortedRates[1] || null;

  const rateDiff = currentRate && previousRate
    ? currentRate.rate - previousRate.rate
    : 0;
  const rateDiffPercent = currentRate && previousRate
    ? ((rateDiff / previousRate.rate) * 100).toFixed(1)
    : '0';

  const getDirection = () => {
    if (rateDiff > 0) return 'up';
    if (rateDiff < 0) return 'down';
    return 'flat';
  };

  const direction = getDirection();

  // W3b §2.3: role-hue tints (dark-correct) instead of light-pinned -50 fills.
  const directionStyles = {
    up: 'tint-success border-success-500/30',
    down: 'tint-danger border-danger-500/30',
    flat: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  const DirectionIcon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  return (
    <div className="space-y-4">
      {/* J5b: current rate — a compact stat card (value + date), not the oversized red
          gradient banner. Trend delta stays as a small subdued chip; no gradient adventure. */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className={cn('text-xs font-medium text-gray-500', isRTL && 'font-arabic')}>
              {t('exchange.currentRate')}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-gray-900">
                {currentRate ? currentRate.rate.toLocaleString() : '—'}
              </span>
              <span className="text-xs text-gray-400">LBP/USD</span>
            </div>
            {currentRate && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmtDate(currentRate.rate_date, locale)}
                </span>
                {currentRate.source && (
                  <Badge variant="outline" size="sm" className="text-2xs">{currentRate.source}</Badge>
                )}
              </div>
            )}
          </div>
          {currentRate && rateDiff !== 0 && (
            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium', directionStyles[direction])}>
              <DirectionIcon className="h-3.5 w-3.5" />
              {/* DA-7: a signed delta is a composed LTR value — isolate it. */}
              <Ltr>{rateDiff > 0 ? '+' : ''}{rateDiff.toFixed(2)} ({rateDiffPercent}%)</Ltr>
            </span>
          )}
        </CardContent>
      </Card>

      {/* Add New Rate Form */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className={cn('text-base font-semibold text-gray-900 flex items-center gap-2', isRTL && 'font-arabic')}>
            <Plus className="h-4 w-4" />
            {t('exchange.addNew')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
                {t('exchange.rate')}
              </label>
              <Input
                data-testid="rate-input"
                type="number"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="rounded-lg border p-2"
                placeholder="e.g. 89500"
              />
            </div>
            <div className="space-y-2">
              <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
                {t('exchange.date')}
              </label>
              <Input
                data-testid="rate-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="rounded-lg border p-2"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
              {t('exchange.source')}
            </label>
            <Input
              data-testid="rate-source"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              className="rounded-lg border p-2"
              placeholder="manual / lira-rate.org / sayrafa"
            />
          </div>
          {saveError && (
            <div data-testid="rate-save-error" className="tint-danger rounded-lg px-3 py-2 text-sm">{saveError}</div>
          )}
          <Button data-testid="rate-save" onClick={() => void saveRate()} disabled={saving} className="rounded-lg">
            {saving ? t('exchange.saving') : t('exchange.saveRate')}
          </Button>
          {savedOk && (
            <p data-testid="rate-save-ok" className={cn('text-xs font-medium text-green-700 text-center', isRTL && 'font-arabic')}>
              {t('exchange.saved')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rates History Table */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className={cn('text-base font-semibold text-gray-900', isRTL && 'font-arabic')}>
            {t('exchange.history')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedRates.length === 0 ? (
            /* DA-31: the one empty-state primitive (calm zero, bare — inside this card). */
            <EmptyState variant="bare" icon={CircleDollarSign} title={t('exchange.noRates')} className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-start px-4 py-2.5 text-xs font-medium text-gray-500">
                      {t('exchange.rate')}
                    </th>
                    <th className="text-start px-4 py-2.5 text-xs font-medium text-gray-500">
                      {t('exchange.date')}
                    </th>
                    <th className="text-start px-4 py-2.5 text-xs font-medium text-gray-500">
                      {t('exchange.source')}
                    </th>
                    <th className="text-end px-4 py-2.5 text-xs font-medium text-gray-500">
                      {t('exchange.change')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedRates.map((r, i) => {
                    const nextRate = sortedRates[i + 1];
                    const diff = nextRate ? r.rate - nextRate.rate : 0;
                    const diffDir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
                    const diffColor = diffDir === 'up' ? 'text-green-600' : diffDir === 'down' ? 'text-red-600' : 'text-gray-400';
                    const DiffIcon = diffDir === 'up' ? ArrowUpRight : diffDir === 'down' ? ArrowDownRight : Minus;

                    return (
                      <tr key={r.id || r.rate_date} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
                            {r.rate.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-400 ms-1">LBP</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-xs text-gray-600', isRTL && 'font-arabic')}>
                            {fmtDate(r.rate_date, locale)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" size="sm" className="text-2xs">
                            {r.source || 'manual'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          {diff !== 0 ? (
                            <span className={cn('text-xs font-medium flex items-center gap-0.5', diffColor, isRTL && 'flex-row-reverse')}>
                              <DiffIcon className="h-3 w-3" />
                              <Ltr>{diff > 0 ? '+' : ''}{diff.toFixed(2)}</Ltr>
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
