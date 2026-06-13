import { dateLocale } from '@/lib/utils/locale-format'
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, CircleDollarSign, Plus, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

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
  const isRTL = locale === 'ar';

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

  const directionStyles = {
    up: 'bg-green-50 text-green-700 border-green-200',
    down: 'bg-red-50 text-red-700 border-red-200',
    flat: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  const DirectionIcon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  return (
    <div className="space-y-4">
      {/* Current Rate Highlight Card */}
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className={cn('text-sm opacity-90', isRTL && 'font-arabic')}>
                {t('exchange.currentRate')}
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold">
                  {currentRate ? currentRate.rate.toLocaleString() : '—'}
                </span>
                <span className="text-sm opacity-80">LBP/USD</span>
              </div>
            </div>
            <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center">
              <TrendingUp className="h-7 w-7" />
            </div>
          </div>
          {currentRate && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/20">
              <div className="flex items-center gap-1 text-xs opacity-90">
                <Calendar className="h-3 w-3" />
                <span>{new Date(currentRate.rate_date).toLocaleDateString(dateLocale(locale))}</span>
              </div>
              {currentRate.source && (
                <Badge className="bg-white/20 text-white border-0 text-2xs">
                  {currentRate.source}
                </Badge>
              )}
              {rateDiff !== 0 && (
                <span className="text-xs ml-auto opacity-90">
                  {rateDiff > 0 ? '+' : ''}{rateDiff.toFixed(2)} ({rateDiffPercent}%)
                </span>
              )}
            </div>
          )}
        </div>
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
                type="number"
                step="0.01"
                className="rounded-lg border p-2"
                placeholder="e.g. 89500"
              />
            </div>
            <div className="space-y-2">
              <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
                {t('exchange.date')}
              </label>
              <Input
                type="date"
                className="rounded-lg border p-2"
                defaultValue={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
              {t('exchange.source')}
            </label>
            <Input
              className="rounded-lg border p-2"
              placeholder="manual / lira-rate.org / sayrafa"
              defaultValue="manual"
            />
          </div>
          <Button className="w-full rounded-lg" size="lg">
            {t('exchange.saveRate')}
          </Button>
          <p className="text-2xs text-gray-400 text-center">
            {t('gym.saveNotActive')}
          </p>
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
            <div className="flex flex-col items-center py-8 text-gray-400">
              <CircleDollarSign className="h-8 w-8 mb-2" />
              <p className={cn('text-sm', isRTL && 'font-arabic')}>
                {t('exchange.noRates')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className={cn('text-left px-4 py-2.5 text-xs font-medium text-gray-500', isRTL && 'text-right')}>
                      {t('exchange.rate')}
                    </th>
                    <th className={cn('text-left px-4 py-2.5 text-xs font-medium text-gray-500', isRTL && 'text-right')}>
                      {t('exchange.date')}
                    </th>
                    <th className={cn('text-left px-4 py-2.5 text-xs font-medium text-gray-500', isRTL && 'text-right')}>
                      {t('exchange.source')}
                    </th>
                    <th className={cn('text-right px-4 py-2.5 text-xs font-medium text-gray-500', isRTL && 'text-left')}>
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
                          <span className="text-xs text-gray-400 ml-1">LBP</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-xs text-gray-600', isRTL && 'font-arabic')}>
                            {new Date(r.rate_date).toLocaleDateString(dateLocale(locale))}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" size="sm" className="text-2xs">
                            {r.source || 'manual'}
                          </Badge>
                        </td>
                        <td className={cn('px-4 py-2.5 text-right', isRTL && 'text-left')}>
                          {diff !== 0 ? (
                            <span className={cn('text-xs font-medium flex items-center gap-0.5', diffColor, isRTL && 'flex-row-reverse')}>
                              <DiffIcon className="h-3 w-3" />
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
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
