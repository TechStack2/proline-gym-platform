import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { Calendar, Clock, Users, MapPin, BookOpen, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { PortalCard, PortalCardTitle, PortalEmpty } from '@/components/portal/portal-kit';

type Props = { params: { locale: string } };

// ─── Locale-aware label helpers ───
function localizedField(obj: Record<string, string> | null | undefined, locale: string, fieldBase: string): string {
  if (!obj) return '—';
  const key = `${fieldBase}_${locale}` as string;
  const val = obj[key];
  if (typeof val === 'string' && val.trim()) return val;
  const enVal = obj[`${fieldBase}_en`];
  if (typeof enVal === 'string' && enVal.trim()) return enVal;
  return '—';
}

export default async function CoachHomePage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Get coach record
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!coach) {
    return (
      <div className={cn('p-4', isRTL && 'rtl')}>
        <PortalCard>
          <PortalEmpty icon={Calendar}>
            {isRTL ? 'لم يتم العثور على ملف المدرب' : locale === 'fr' ? 'Profil coach introuvable' : 'Coach profile not found'}
          </PortalEmpty>
        </PortalCard>
      </div>
    );
  }

  // Get today's day of week (0=Sunday in Postgres, matches JS getDay)
  const today = new Date();
  const dayOfWeek = today.getDay();

  // UX-2: today's TRIALS join the day surface (not just the tab) — same
  // definer reader as /coach/trials; filtered to today + still-scheduled.
  const todayIso = today.toISOString().split('T')[0];
  const { data: allTrials } = await supabase.rpc('get_coach_trials');
  const todaysTrials: any[] = (allTrials || []).filter(
    (tr: any) => tr.scheduled_date === todayIso && tr.status === 'scheduled',
  );

  // Fetch today's class schedules for this coach
  const { data: schedulesRaw } = await supabase
    .from('class_schedules')
    .select(`
      id,
      start_time,
      end_time,
      classes!inner (
        id,
        room,
        max_capacity,
        name_ar, name_en, name_fr,
        discipline_id,
        disciplines!inner (
          name_ar, name_en, name_fr
        )
      )
    `)
    .eq('day_of_week', dayOfWeek)
    .eq('classes.coach_id', coach.id)
    .eq('classes.is_active', true)
    .eq('is_active', true)
    .order('start_time', { ascending: true });

  // Supabase nested joins may return arrays for one-to-one relations; normalize
  const todaysSchedules: any[] = (schedulesRaw || []).map((s: any) => ({
    ...s,
    classes: Array.isArray(s.classes) ? s.classes[0] : s.classes,
  }));

  // Collect all class IDs
  const classIds: string[] = todaysSchedules
    .map((s: any) => s.classes?.id)
    .filter((id: any) => id != null);

  // Fetch enrollment counts for each class
  const enrollmentMap: Record<string, number> = {};
  if (classIds.length > 0) {
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('class_id')
      .in('class_id', classIds)
      .eq('is_active', true);

    for (const e of (enrollments || [])) {
      enrollmentMap[e.class_id] = (enrollmentMap[e.class_id] || 0) + 1;
    }
  }

  // Fetch today's attendance status per class
  const todayStr = today.toISOString().split('T')[0];
  const attendanceStatusMap: Record<string, { total: number; marked: number }> = {};
  if (classIds.length > 0) {
    const { data: records } = await supabase
      .from('attendance_records')
      .select('class_id')
      .in('class_id', classIds)
      .eq('attendance_date', todayStr);

    for (const cid of classIds) {
      const enrolled = enrollmentMap[cid] || 0;
      const marked = (records || []).filter((r: any) => r.class_id === cid).length;
      attendanceStatusMap[cid] = { total: enrolled, marked };
    }
  }

  const totalClasses = todaysSchedules.length;
  const totalStudents = Object.values(enrollmentMap).reduce((sum, n) => sum + n, 0);
  const completedClasses = Object.values(attendanceStatusMap).filter(
    s => s.total > 0 && s.marked >= s.total
  ).length;
  const pendingClasses = totalClasses - completedClasses;

  // Load i18n translations
  const { default: messages } = await import(`@/i18n/messages/${locale}.json`);
  const t = (path: string) => {
    const keys = path.split('.');
    let val: any = messages;
    for (const k of keys) {
      val = val?.[k];
    }
    return typeof val === 'string' ? val : path;
  };

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      {/* Header */}
      <div>
        <h2 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')}>
          {t('coach.home.title')}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {t('coach.home.subtitle')}
        </p>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Calendar}
          value={totalClasses}
          label={t('coach.home.stats.totalClasses')}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          icon={Users}
          value={totalStudents}
          label={t('coach.home.stats.totalStudents')}
          color="text-[#cd1419]"
          bg="bg-red-50"
          testid="portal-brand"
        />
        <StatCard
          icon={CheckCircle2}
          value={completedClasses}
          label={t('coach.home.stats.completed')}
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          icon={Circle}
          value={pendingClasses}
          label={t('coach.home.stats.pending')}
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </div>

      {/* Today's trials (UX-2) — actionable on the trials tab */}
      {todaysTrials.length > 0 && (
        <PortalCard className="space-y-2" data-testid="coach-home-trials">
          <PortalCardTitle
            icon={Users}
            right={
              <Link href={`/${locale}/coach/trials`} className="text-xs font-medium text-[#cd1419]">
                {t('coachTrials.openTab')}
              </Link>
            }
          >
            {t('coachTrials.todayTitle')}
          </PortalCardTitle>
          {todaysTrials.map((tr: any) => (
            <Link
              key={tr.id}
              href={`/${locale}/coach/trials`}
              data-testid="coach-home-trial-row"
              data-lead-name={tr.lead_name}
              className="flex items-center justify-between rounded-xl border px-3 py-2 hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-800">{tr.lead_name}</span>
              <span className="text-xs text-gray-500">
                {tr.scheduled_time ? tr.scheduled_time.slice(0, 5) : ''}
              </span>
            </Link>
          ))}
        </PortalCard>
      )}

      {/* Class List */}
      {todaysSchedules.length === 0 ? (
        <PortalCard>
          <PortalEmpty icon={Calendar}>
            <span className="block font-medium text-gray-500">{t('coach.home.noClasses')}</span>
            <span className="mt-1 block text-xs">{t('coach.home.noClassesHint')}</span>
          </PortalEmpty>
        </PortalCard>
      ) : (
        <div className="space-y-3">
          {todaysSchedules.map((schedule: any) => {
            const cls = schedule.classes;
            const disc = cls?.disciplines && (Array.isArray(cls.disciplines) ? cls.disciplines[0] : cls.disciplines);
            const classId = cls?.id;
            const enrolled = enrollmentMap[classId] || 0;
            const attStatus = attendanceStatusMap[classId] || { total: enrolled, marked: 0 };
            const isComplete = attStatus.total > 0 && attStatus.marked >= attStatus.total;

            return (
              <PortalCard
                key={schedule.id}
                className={cn(
                  'border-l-4',
                  isComplete ? 'border-l-green-500' : 'border-l-[#cd1419]'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Time */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-gray-700">
                        {schedule.start_time?.substring(0, 5)} — {schedule.end_time?.substring(0, 5)}
                      </span>
                    </div>

                    {/* Class Name */}
                    <h3 className={cn('text-base font-bold text-gray-900', isRTL && 'font-arabic')}>
                      {localizedField(cls, locale, 'name')}
                    </h3>

                    {/* Discipline */}
                    {disc && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <BookOpen className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500">
                          {localizedField(disc, locale, 'name')}
                        </span>
                      </div>
                    )}

                    {/* Room + Students row */}
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {cls?.room && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-500">{cls.room}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500">
                          {enrolled} / {cls?.max_capacity || '∞'} {t('coach.home.students')}
                        </span>
                      </div>
                      {isComplete && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {t('coach.home.stats.completed')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Start Attendance Button */}
                  <Link
                    href={`/${locale}/coach/attendance?classId=${classId}`}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ml-3',
                      isComplete
                        ? 'bg-gray-100 text-gray-400 pointer-events-none'
                        : 'bg-[#cd1419] text-white hover:bg-[#b01216]'
                    )}
                    aria-disabled={isComplete}
                  >
                    {t('coach.home.startAttendance')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </PortalCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  color,
  bg,
  testid,
}: {
  icon: any;
  value: number;
  label: string;
  color: string;
  bg: string;
  testid?: string;
}) {
  return (
    <PortalCard className="text-center">
      <div className={cn('inline-flex items-center justify-center h-10 w-10 rounded-full mb-2', bg)}>
        <Icon data-testid={testid} className={cn('h-5 w-5', color)} />
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
    </PortalCard>
  );
}
