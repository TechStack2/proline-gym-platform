import { cn } from '@/lib/utils';
import { Medal, Building2, Users2 } from 'lucide-react';

type WhySectionProps = {
  locale: string;
};

const reasons = [
  {
    key: 'coaches',
    icon: Medal,
    color: 'from-amber-400 to-yellow-600',
    titleEn: 'Expert Coaches',
    titleAr: 'مدربون خبراء',
    descEn: 'Train under certified instructors with international competition experience. The Fakih Brothers bring years of professional fighting and coaching expertise.',
    descAr: 'تدرب تحت إشراف مدربين معتمدين ذوي خبرة في المنافسات الدولية. الأخوة فقيه يجلبون سنوات من الخبرة الاحترافية في القتال والتدريب.',
  },
  {
    key: 'facility',
    icon: Building2,
    color: 'from-blue-400 to-cyan-600',
    titleEn: 'Modern Facility',
    titleAr: 'منشأة حديثة',
    descEn: 'Train in a fully equipped facility at Baabda Sky Business Center. Professional-grade mats, bags, and equipment for every discipline.',
    descAr: 'تدرب في منشأة مجهزة بالكامل في مركز سكاي للأعمال ببدا. بساط احترافي وأكياس ومعدات لكل التخصصات.',
  },
  {
    key: 'community',
    icon: Users2,
    color: 'from-green-400 to-emerald-600',
    titleEn: 'Strong Community',
    titleAr: 'مجتمع قوي',
    descEn: 'Join 2,760+ followers and a thriving community of fighters, fitness enthusiasts, and families. Adults, kids, ladies — everyone has a home here.',
    descAr: 'انضم إلى أكثر من 2,760 متابع ومجتمع مزدهر من المقاتلين وعشاق اللياقة والعائلات. الكبار، الأطفال، السيدات — للجميع مكان هنا.',
  },
];

export function WhySection({ locale }: WhySectionProps) {
  const isRTL = locale === 'ar';

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2
            className={cn(
              'text-3xl sm:text-4xl font-bold text-secondary-900',
              isRTL && 'font-arabic'
            )}
          >
            {isRTL ? 'لماذا برو لاين؟' : 'Why PRO LINE?'}
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            {isRTL
              ? 'لسنا مجرد نادٍ رياضي — نحن وجهة للمقاتلين'
              : 'More than a gym — we\'re a destination for fighters'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reasons.map((reason) => {
            const Icon = reason.icon;
            return (
              <div key={reason.key} className="text-center group">
                <div
                  className={cn(
                    'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform duration-300',
                    reason.color
                  )}
                >
                  <Icon className="h-8 w-8 text-white" />
                </div>
                <h3 className={cn('text-xl font-semibold text-secondary-900 mb-3', isRTL && 'font-arabic')}>
                  {isRTL ? reason.titleAr : reason.titleEn}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {isRTL ? reason.descAr : reason.descEn}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}