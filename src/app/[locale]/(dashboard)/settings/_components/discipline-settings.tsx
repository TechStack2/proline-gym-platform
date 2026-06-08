import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Swords, ArrowUp, GripVertical } from 'lucide-react';

type BeltHierarchy = {
  id?: string;
  discipline_id?: string;
  rank?: string;
  name_ar?: string;
  name_en?: string;
  name_fr?: string;
  sort_order?: number;
  stripe_count?: number;
  min_months_in_rank?: number;
  min_classes_attended?: number;
  is_black_belt?: boolean;
};

type Discipline = {
  id?: string;
  name_ar?: string;
  name_en?: string;
  name_fr?: string;
  description_ar?: string;
  description_en?: string;
  description_fr?: string;
  sort_order?: number;
  is_active?: boolean;
  belt_hierarchies?: BeltHierarchy[] | BeltHierarchy;
};

type Props = {
  disciplines: Discipline[];
  locale: string;
};

function safeArray<T>(val: T | T[] | undefined | null): T[] {
  if (Array.isArray(val)) return val;
  if (val != null) return [val];
  return [];
}

export function DisciplineSettings({ disciplines, locale }: Props) {
  const t = useTranslations('settings');
  const isRTL = locale === 'ar';

  const getLocaleName = (item: { name_ar?: string; name_en?: string; name_fr?: string }) => {
    if (locale === 'ar') return item.name_ar || item.name_en || '';
    if (locale === 'fr') return item.name_fr || item.name_en || '';
    return item.name_en || '';
  };

  const getLocaleDesc = (item: { description_ar?: string; description_en?: string; description_fr?: string }) => {
    if (locale === 'ar') return item.description_ar || item.description_en || '';
    if (locale === 'fr') return item.description_fr || item.description_en || '';
    return item.description_en || '';
  };

  const sorted = [...disciplines].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const activeDisciplines = sorted.filter(d => d.is_active !== false);
  const inactiveDisciplines = sorted.filter(d => d.is_active === false);

  const beltColor = (rank: string | undefined, isBlack: boolean | undefined) => {
    if (isBlack) return 'bg-gray-900 text-white';
    switch (rank) {
      case 'white': case 'white_yellow': return 'bg-gray-100 text-gray-700 border';
      case 'yellow': case 'yellow_orange': return 'bg-yellow-100 text-yellow-700';
      case 'orange': case 'orange_green': return 'bg-orange-100 text-orange-700';
      case 'green': case 'green_blue': return 'bg-green-100 text-green-700';
      case 'blue': case 'blue_purple': return 'bg-blue-100 text-blue-700';
      case 'purple': case 'purple_brown': return 'bg-purple-100 text-purple-700';
      case 'brown': case 'brown_black': return 'bg-amber-100 text-amber-800';
      case 'red': return 'bg-red-100 text-red-700';
      case 'black_1': case 'black_2': case 'black_3': case 'black_4': case 'black_5':
        return 'bg-gray-900 text-white';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const beltLabel = (rank: string | undefined, isBlack: boolean | undefined) => {
    if (isBlack) {
      const dan = rank?.replace('black_', '') || '';
      return `⚫ Dan ${dan}`;
    }
    if (!rank) return '—';
    return rank.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  if (disciplines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Swords className="h-10 w-10 mb-2" />
        <p className={cn('text-sm', isRTL && 'font-arabic')}>
          {t('discipline.noDisciplines')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Disciplines */}
      {activeDisciplines.length > 0 && (
        <div className="space-y-3">
          <h2 className={cn('text-sm font-semibold text-gray-500 flex items-center gap-2', isRTL && 'font-arabic')}>
            <Swords className="h-3.5 w-3.5" />
            {t('discipline.activeDisciplines')}
            <Badge variant="success" size="sm">{activeDisciplines.length}</Badge>
          </h2>

          <div className="space-y-3">
            {activeDisciplines.map(disc => {
              const belts = safeArray(disc.belt_hierarchies).sort(
                (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
              );

              return (
                <Card key={disc.id} className="rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center">
                          <Swords className="h-5 w-5 text-primary-500" />
                        </div>
                        <div>
                          <CardTitle className={cn('text-base font-bold text-gray-900', isRTL && 'font-arabic')}>
                            {getLocaleName(disc)}
                          </CardTitle>
                          {getLocaleDesc(disc) && (
                            <p className={cn('text-xs text-gray-500 mt-0.5', isRTL && 'font-arabic')}>
                              {getLocaleDesc(disc)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" size="sm" className="text-2xs">
                          <GripVertical className="h-3 w-3 mr-0.5" />
                          {t('discipline.order')} #{disc.sort_order || 0}
                        </Badge>
                        <Badge variant="success" size="sm">
                          {t('membership.active')}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  {belts.length > 0 ? (
                    <CardContent className="p-3">
                      <div className="space-y-2">
                        <p className={cn('text-2xs font-medium text-gray-400 uppercase tracking-wider', isRTL && 'font-arabic')}>
                          {t('discipline.beltSystem')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {belts.map((belt, idx) => (
                            <div
                              key={belt.id || idx}
                              className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                                beltColor(belt.rank, belt.is_black_belt)
                              )}
                            >
                              <span className="text-2xs opacity-60">{idx + 1}</span>
                              <ArrowUp className="h-3 w-3 opacity-50" />
                              <span className={cn(isRTL && 'font-arabic')}>
                                {getLocaleName(belt)}
                              </span>
                              {belt.stripe_count && belt.stripe_count > 0 && (
                                <span className="text-2xs opacity-60">
                                  {belt.stripe_count} {t('discipline.stripe')}
                                </span>
                              )}
                              {belt.is_black_belt && (
                                <span className="text-2xs opacity-80 ml-0.5">★</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Belt detail rows */}
                        <div className="mt-3 space-y-1">
                          {belts.map((belt, idx) => (
                            <div key={belt.id || idx} className="flex items-center gap-2 text-xs text-gray-500 py-1">
                              <div className={cn('w-2 h-2 rounded-full shrink-0', beltColor(belt.rank, belt.is_black_belt))} />
                              <span className={cn('font-medium text-gray-700 min-w-[80px]', isRTL && 'font-arabic')}>
                                {getLocaleName(belt)}
                              </span>
                              <span className="text-2xs text-gray-400">
                                {beltLabel(belt.rank, belt.is_black_belt)}
                              </span>
                              <div className="flex gap-3 ml-auto">
                                {belt.min_months_in_rank && (
                                  <span className="text-2xs">
                                    {belt.min_months_in_rank} {t('discipline.mo')}
                                  </span>
                                )}
                                {belt.min_classes_attended && (
                                  <span className="text-2xs">
                                    {belt.min_classes_attended} {t('discipline.classes')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  ) : (
                    <CardContent className="p-3">
                      <p className={cn('text-xs text-gray-400 italic', isRTL && 'font-arabic')}>
                        {t('discipline.noBeltSystem')}
                      </p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Inactive Disciplines */}
      {inactiveDisciplines.length > 0 && (
        <div className="space-y-3 opacity-60">
          <h2 className={cn('text-sm font-semibold text-gray-400 flex items-center gap-2', isRTL && 'font-arabic')}>
            <Swords className="h-3.5 w-3.5" />
            {t('discipline.inactiveDisciplines')}
            <Badge variant="secondary" size="sm">{inactiveDisciplines.length}</Badge>
          </h2>
          <div className="space-y-2">
            {inactiveDisciplines.map(disc => (
              <Card key={disc.id} className="rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Swords className="h-4 w-4 text-gray-400" />
                      </div>
                      <CardTitle className={cn('text-sm font-semibold text-gray-400', isRTL && 'font-arabic')}>
                        {getLocaleName(disc)}
                      </CardTitle>
                    </div>
                    <Badge variant="secondary" size="sm">
                      {t('membership.inactive')}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
