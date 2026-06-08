import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { Check, Zap } from 'lucide-react';

type PricingSectionProps = {
  locale: string;
};

const fallbackPlans = [
  { name: 'Monthly', nameAr: 'شهري', features: ['All group classes', 'Locker room access', '1 guest pass/month'], featuresAr: ['كل الحصص الجماعية', 'غرفة تبديل الملابس', 'بطاقة ضيف واحدة/شهر'] },
  { name: 'Quarterly', nameAr: 'ربع سنوي', features: ['All Monthly perks', '1 PT session/month', 'Priority class booking'], featuresAr: ['كل مميزات الشهري', 'جلسة تدريب خاص/شهر', 'حجز أولوية للحصص'] },
  { name: 'Annual', nameAr: 'سنوي', features: ['All Quarterly perks', 'Unlimited PT sessions', 'Bring a friend anytime', 'Exclusive PRO LINE gear'], featuresAr: ['كل مميزات الربع سنوي', 'جلسات PT غير محدودة', 'أحضر صديق في أي وقت', 'معدات برو لاين حصرية'] },
];

const priceMap: Record<string, string> = { Monthly: '$50/mo', Quarterly: '$130/3mo', Annual: '$450/yr' };
const priceArMap: Record<string, string> = { شهري: '50$/شهر', 'ربع سنوي': '130$/3 أشهر', سنوي: '450$/سنة' };

export async function PricingSection({ locale }: PricingSectionProps) {
  const isRTL = locale === 'ar';
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from('membership_plans')
    .select(`name_ar, name_en, duration_days, price_usd`)
    .order('duration_days');

  const plansToRender = plans && plans.length > 0 ? plans : null;

  return (
    <section id="pricing" className="py-20 lg:py-28 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className={cn('text-3xl sm:text-4xl font-bold text-secondary-900', isRTL && 'font-arabic')}>
            {isRTL ? 'خطط العضوية' : 'Membership Plans'}
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            {isRTL
              ? 'اختر الخطة المناسبة لرحلتك — ابدأ في أي وقت'
              : 'Choose the plan that fits your journey — start anytime'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {fallbackPlans.map((plan, i) => {
            const isAnnual = plan.name === 'Annual';
            const planName = isRTL ? plan.nameAr : plan.name;
            const planPrice = isRTL ? priceArMap[plan.nameAr] : priceMap[plan.name];
            const features = isRTL ? plan.featuresAr : plan.features;

            return (
              <div
                key={i}
                className={cn(
                  'relative rounded-2xl bg-white p-8 shadow-elevation-1',
                  'hover:shadow-elevation-3 transition-all duration-300 hover:-translate-y-1',
                  isAnnual && 'ring-2 ring-amber-400 shadow-elevation-2'
                )}
              >
                {isAnnual && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-900">
                    <Zap className="h-3 w-3" />
                    {isRTL ? 'الأفضل قيمة' : 'Best Value'}
                  </div>
                )}

                <h3 className={cn('text-xl font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                  {planName}
                </h3>
                <p className="mt-4">
                  <span className="text-4xl font-bold text-secondary-900">{planPrice}</span>
                </p>

                <ul className="mt-6 space-y-3">
                  {features.map((feature: string, j: number) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <a
                    href="#trial"
                    className={cn(
                      'block text-center rounded-xl px-6 py-3 text-sm font-semibold transition-all hover:scale-105 active:scale-95',
                      isAnnual
                        ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-glow-primary'
                        : 'bg-secondary-900 text-white hover:bg-secondary-800'
                    )}
                  >
                    {isRTL ? 'ابدأ الآن' : 'Get Started'}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}