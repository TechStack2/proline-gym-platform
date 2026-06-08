import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { Dumbbell, Heart, Music, Users, Shield, Baby } from 'lucide-react';

type DisciplinesSectionProps = {
  locale: string;
};

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'Muay Thai': Dumbbell,
  Boxing: Shield,
  Fitness: Heart,
  Zumba: Music,
  'Ladies Training': Users,
  Kids: Baby,
};

const colorMap: Record<string, string> = {
  'Muay Thai': 'from-red-500 to-orange-500',
  Boxing: 'from-blue-500 to-indigo-500',
  Fitness: 'from-green-500 to-emerald-500',
  Zumba: 'from-pink-500 to-purple-500',
  'Ladies Training': 'from-violet-500 to-fuchsia-500',
  Kids: 'from-yellow-500 to-amber-500',
};

export async function DisciplinesSection({ locale }: DisciplinesSectionProps) {
  const isRTL = locale === 'ar';
  const supabase = await createClient();

  const { data: disciplines } = await supabase
    .from('disciplines')
    .select(`name_${locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'}, name_en`)
    .order('sort_order');

  const programs = (disciplines || []).map((d: any) => ({
    name: d[`name_${locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'}`] || d.name_en,
    key: d.name_en,
  }));

  return (
    <section id="disciplines" className="py-20 lg:py-28 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2
            className={cn(
              'text-3xl sm:text-4xl font-bold text-secondary-900',
              isRTL && 'font-arabic'
            )}
          >
            {isRTL ? 'برامجنا' : 'Our Programs'}
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            {isRTL
              ? 'تدريب عالمي المستوى في 6 تخصصات — لجميع الأعمار والمستويات'
              : 'World-class training across 6 disciplines — for all ages and levels'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program: { name: string; key: string }) => {
            const Icon = iconMap[program.key] || Dumbbell;
            const gradient = colorMap[program.key] || 'from-primary-500 to-primary-700';

            return (
              <div
                key={program.key}
                className="group relative rounded-2xl bg-white p-6 shadow-elevation-1 hover:shadow-elevation-3 transition-all duration-300 hover:-translate-y-1"
              >
                <div
                  className={cn(
                    'mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br',
                    gradient
                  )}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className={cn('text-lg font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                  {program.name}
                </h3>
                <div className="mt-3 h-1 w-12 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 group-hover:w-20 transition-all duration-300" />
              </div>
            );
          })}
        </div>

        {(!disciplines || disciplines.length === 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: isRTL ? 'ملاكمة تايلاندية' : 'Muay Thai', key: 'Muay Thai' },
              { name: isRTL ? 'ملاكمة' : 'Boxing', key: 'Boxing' },
              { name: isRTL ? 'لياقة بدنية' : 'Fitness', key: 'Fitness' },
              { name: 'Zumba', key: 'Zumba' },
              { name: isRTL ? 'تدريب السيدات' : 'Ladies Training', key: 'Ladies Training' },
              { name: isRTL ? 'أطفال' : 'Kids', key: 'Kids' },
            ].map((program, i) => {
              const Icon = iconMap[program.key] || Dumbbell;
              const gradient = colorMap[program.key] || 'from-primary-500 to-primary-700';
              return (
                <div
                  key={i}
                  className="group relative rounded-2xl bg-white p-6 shadow-elevation-1 hover:shadow-elevation-3 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className={cn(
                    'mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br',
                    gradient
                  )}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className={cn('text-lg font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                    {program.name}
                  </h3>
                  <div className="mt-3 h-1 w-12 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 group-hover:w-20 transition-all duration-300" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}