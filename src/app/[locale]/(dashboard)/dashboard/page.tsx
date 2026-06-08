import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { Users, Calendar, DollarSign, Dumbbell, ClipboardList } from 'lucide-react';

type Props = {
  params: { locale: string };
};

export const dynamic = 'force-dynamic';

const quickActions = [
  { key: 'addStudent', label: 'Add Student', icon: Users, path: '/students/add' },
  { key: 'createClass', label: 'Create Class', icon: Calendar, path: '/classes/add' },
  { key: 'takeAttendance', label: 'Take Attendance', icon: ClipboardList, path: '/attendance' },
  { key: 'recordPayment', label: 'Record Payment', icon: DollarSign, path: '/payments/add' },
];

export default async function DashboardPage({ params }: Props) {
  const { locale } = params;
  const isRTL = locale === 'ar';
  const t = await getTranslations();
  const supabase = await createClient();

  // ── Live, gym-scoped counts (was hardcoded to 0) ──────────
  const { data: { user } } = await supabase.auth.getUser();
  let gymId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('gym_id')
      .eq('id', user.id)
      .single();
    gymId = profile?.gym_id ?? null;
  }

  let studentCount = 0;
  let classCount = 0;
  let attendanceToday = 0;
  let revenueUsd = 0;

  if (gymId) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const [students, classes, attendance, payments] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('is_active', true),
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('is_active', true),
      // attendance_records / payments have no gym_id column — RLS scopes them to the gym.
      supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', today),
      supabase.from('payments').select('amount_usd').gte('created_at', monthStart),
    ]);

    studentCount = students.count ?? 0;
    classCount = classes.count ?? 0;
    attendanceToday = attendance.count ?? 0;
    revenueUsd = (payments.data ?? []).reduce((sum, p) => sum + Number((p as { amount_usd: number }).amount_usd || 0), 0);
  }

  const stats = [
    { key: 'totalStudents', label: 'nav.students', icon: Users, value: String(studentCount) },
    { key: 'todayClasses', label: 'nav.classes', icon: Dumbbell, value: String(classCount) },
    { key: 'todayAttendance', label: 'nav.attendance', icon: ClipboardList, value: String(attendanceToday) },
    { key: 'monthlyRevenue', label: 'nav.payments', icon: DollarSign, value: `$${revenueUsd.toFixed(0)}` },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
          {isRTL ? 'لوحة التحكم' : 'Dashboard'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isRTL
            ? 'مرحباً بك في منصة إدارة برولاين جيم'
            : 'Welcome to Proline Gym Management Platform'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.key}
              className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
                  <Icon className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t(stat.label as 'nav.students')}</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid={`stat-${stat.key}`}>{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className={cn('mb-3 text-lg font-semibold text-gray-900', isRTL && 'font-arabic')}>
          {isRTL ? 'إجراءات سريعة' : 'Quick Actions'}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                className="flex items-center gap-3 rounded-lg border bg-white p-4 text-left hover:bg-gray-50 hover:border-primary-200 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Icon className="h-5 w-5 text-gray-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className={cn('mb-4 text-lg font-semibold text-gray-900', isRTL && 'font-arabic')}>
          {isRTL ? 'آخر النشاطات' : 'Recent Activity'}
        </h2>
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <ClipboardList className="mb-2 h-8 w-8" />
          <p className="text-sm">
            {isRTL ? 'لا توجد نشاطات بعد' : 'No recent activity yet'}
          </p>
        </div>
      </div>
    </div>
  );
}
