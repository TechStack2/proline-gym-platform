import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, DollarSign, Activity, Clock, Dumbbell } from 'lucide-react';

type MembershipPlan = {
  id?: string;
  name_ar?: string;
  name_en?: string;
  name_fr?: string;
  description_ar?: string;
  description_en?: string;
  description_fr?: string;
  duration_days?: number;
  price_usd?: number;
  price_lbp?: number;
  max_classes_per_week?: number | null;
  includes_pt?: boolean;
  is_active?: boolean;
};

type Props = {
  plans: MembershipPlan[];
  locale: string;
};

export function MembershipPlans({ plans, locale }: Props) {
  const t = useTranslations('settings');
  const isRTL = locale === 'ar';

  const getDurationLabel = (days: number) => {
    if (days >= 365) {
      return t('membership.annual');
    }
    if (days >= 90) {
      return t('membership.quarterly');
    }
    if (days >= 30) {
      return t('membership.monthly');
    }
    return `${days} ${t('membership.days')}`;
  };

  const getLocaleName = (plan: MembershipPlan) => {
    if (locale === 'ar') return plan.name_ar || plan.name_en || '';
    if (locale === 'fr') return plan.name_fr || plan.name_en || '';
    return plan.name_en || '';
  };

  const getLocaleDesc = (plan: MembershipPlan) => {
    if (locale === 'ar') return plan.description_ar || plan.description_en || '';
    if (locale === 'fr') return plan.description_fr || plan.description_en || '';
    return plan.description_en || '';
  };

  const activePlans = plans.filter(p => p.is_active !== false);
  const inactivePlans = plans.filter(p => p.is_active === false);

  const PlanCard = ({ plan }: { plan: MembershipPlan }) => (
    <Card className="rounded-2xl shadow-sm overflow-hidden">
      <div className={`p-4 border-b ${plan.is_active !== false ? 'bg-primary-50' : 'bg-gray-100'}`}>
        <div className="flex items-center justify-between">
          <h3 className={cn('text-base font-bold text-gray-900', isRTL && 'font-arabic')}>
            {getLocaleName(plan)}
          </h3>
          <Badge
            variant={plan.is_active !== false ? 'success' : 'secondary'}
            size="sm"
          >
            {plan.is_active !== false
              ? t('membership.active')
              : t('membership.inactive')}
          </Badge>
        </div>
        {getLocaleDesc(plan) && (
          <p className={cn('text-xs text-gray-500 mt-1', isRTL && 'font-arabic')}>
            {getLocaleDesc(plan)}
          </p>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Price Display */}
        <div className="flex items-end gap-4">
          <div>
            <p className={cn('text-2xs text-gray-500', isRTL && 'font-arabic')}>
              {t('membership.price')}
            </p>
            <p className="text-xl font-bold text-gray-900">
              ${plan.price_usd?.toLocaleString() || '—'}
            </p>
          </div>
          {plan.price_lbp && (
            <div>
              <p className={cn('text-2xs text-gray-400', isRTL && 'font-arabic')}>
                LBP
              </p>
              <p className="text-sm font-medium text-gray-500">
                {plan.price_lbp?.toLocaleString() || '—'} L.L.
              </p>
            </div>
          )}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <CalendarDays className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <div>
              <p className="text-2xs text-gray-500">
                {t('membership.duration')}
              </p>
              <p className={cn('text-xs font-semibold text-gray-900', isRTL && 'font-arabic')}>
                {plan.duration_days ? `${plan.duration_days}d` : '—'}
                <span className="text-2xs text-gray-400 ml-1">
                  ({plan.duration_days ? getDurationLabel(plan.duration_days) : ''})
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <Activity className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <div>
              <p className="text-2xs text-gray-500">
                {t('membership.classesPerWeek')}
              </p>
              <p className={cn('text-xs font-semibold text-gray-900', isRTL && 'font-arabic')}>
                {plan.max_classes_per_week === null ? '∞' : plan.max_classes_per_week || '—'}
              </p>
            </div>
          </div>
        </div>

        {/* PT Badge */}
        {plan.includes_pt && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-100">
            <Dumbbell className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className={cn('text-xs font-medium text-amber-700', isRTL && 'font-arabic')}>
              {t('membership.includesPT')}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <DollarSign className="h-10 w-10 mb-2" />
          <p className={cn('text-sm', isRTL && 'font-arabic')}>
            {t('membership.noPlans')}
          </p>
        </div>
      ) : (
        <>
          {/* Active Plans */}
          {activePlans.length > 0 && (
            <div className="space-y-3">
              <h2 className={cn('text-sm font-semibold text-gray-500 flex items-center gap-2', isRTL && 'font-arabic')}>
                <Activity className="h-3.5 w-3.5" />
                {t('membership.activePlans')}
                <Badge variant="success" size="sm">{activePlans.length}</Badge>
              </h2>
              <div className="grid gap-3">
                {activePlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Plans */}
          {inactivePlans.length > 0 && (
            <div className="space-y-3">
              <h2 className={cn('text-sm font-semibold text-gray-400 flex items-center gap-2', isRTL && 'font-arabic')}>
                <Clock className="h-3.5 w-3.5" />
                {t('membership.inactivePlans')}
                <Badge variant="secondary" size="sm">{inactivePlans.length}</Badge>
              </h2>
              <div className="grid gap-3 opacity-60">
                {inactivePlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
