import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Users, CreditCard, Award, TrendingUp, CalendarDays, ArrowRight } from 'lucide-react'
import Link from 'next/link'

type Props = { params: { locale: string } }

export default async function PortalHomePage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name_en, first_name_ar, first_name_fr, last_name_en, last_name_ar, last_name_fr')
    .eq('id', user.id)
    .single()

  const firstName = isRTL ? profile?.first_name_ar : (locale === 'fr' ? profile?.first_name_fr : profile?.first_name_en)

  const { data: student } = await supabase
    .from('students')
    .select('id, profile_id, join_date')
    .eq('profile_id', user.id)
    .single()

  const { data: membership } = await supabase
    .from('student_memberships')
    .select('status, end_date, plan_id, membership_plans:plan_id (name_en, name_ar, name_fr)')
    .eq('student_id', student?.id)
    .eq('status', 'active')
    .maybeSingle()

  const { data: belt } = await supabase
    .from('belt_promotions')
    .select('to_rank, discipline_id, disciplines:discipline_id (name_en, name_ar, name_fr)')
    .eq('student_id', student?.id)
    .order('promotion_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { count: enrolledCount } = await supabase
    .from('class_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student?.id)
    .eq('is_active', true)

  const { data: recentAttendance } = await supabase
    .from('attendance_records')
    .select('attendance_date, status, classes:class_id (name_en, name_ar, name_fr)')
    .eq('student_id', student?.id)
    .order('attendance_date', { ascending: false })
    .limit(5)

  const { data: pendingInvoices } = await supabase
    .from('invoices')
    .select('total_usd, status')
    .eq('student_id', student?.id)
    .in('status', ['pending', 'overdue'])

  const balanceDue = pendingInvoices?.reduce((sum, inv) => sum + (inv.total_usd || 0), 0) || 0
  const mplans: any = (membership as any)?.membership_plans
  const mplan = Array.isArray(mplans) ? mplans[0] : mplans
  const membershipNameVal = mplan ? (isRTL ? mplan.name_ar : (locale === 'fr' ? mplan.name_fr : mplan.name_en)) : null
  const beltLabelVal = belt?.to_rank ? (belt.to_rank as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null
  const disc: any = (belt as any)?.disciplines
  const discObj = Array.isArray(disc) ? disc[0] : disc
  const disciplineNameVal = discObj ? (isRTL ? discObj.name_ar : (locale === 'fr' ? discObj.name_fr : discObj.name_en)) : ''

  const getCName = (cls: any) => {
    const cdata: any = Array.isArray(cls?.classes) ? cls.classes[0] : cls?.classes
    if (!cdata) return 'Unknown'
    return isRTL ? cdata.name_ar || cdata.name_en : (locale === 'fr' ? cdata.name_fr || cdata.name_en : cdata.name_en)
  }

  const statusLabels: Record<string,string> = {
    present: isRTL ? 'حاضر' : 'Present', absent: isRTL ? 'غائب' : 'Absent',
    late: isRTL ? 'متأخر' : 'Late', excused: isRTL ? 'معذور' : 'Excused'
  }
  const statusColors: Record<string,string> = {
    present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700',
    late: 'bg-yellow-100 text-yellow-700', excused: 'bg-blue-100 text-blue-700'
  }

  return (
    <div className={cn('p-4 space-y-6', isRTL && 'rtl')}>
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">
          {isRTL ? 'مرحباً' : 'Welcome'}{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">{isRTL ? 'إليك ملخص حسابك' : "Here's your account summary"}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: isRTL ? 'الحصص' : 'Classes', value: enrolledCount || 0, icon: Users, color: 'bg-blue-50 text-blue-600' },
          { label: isRTL ? 'العضوية' : 'Membership', value: membership?.status === 'active' ? (isRTL ? 'نشطة' : 'Active') : (isRTL ? 'منتهية' : 'Expired'), icon: CreditCard, color: membership?.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600' },
          { label: isRTL ? 'الرتبة' : 'Belt', value: beltLabelVal || '—', icon: Award, color: 'bg-purple-50 text-purple-600' },
          { label: isRTL ? 'الرصيد' : 'Balance', value: balanceDue > 0 ? `$${balanceDue}` : (isRTL ? 'لا يوجد' : 'None'), icon: TrendingUp, color: balanceDue > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <div key={i} className={cn('rounded-2xl p-4 shadow-sm', s.color)}>
              <Icon className="h-5 w-5 mb-2 opacity-70" />
              <p className="text-xs opacity-70">{s.label}</p>
              <p className="text-lg font-bold mt-0.5">{s.value}</p>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: isRTL ? 'الجدول' : 'Schedule', href: `/${locale}/portal/schedule`, icon: CalendarDays },
          { label: isRTL ? 'الفواتير' : 'Billing', href: `/${locale}/portal/billing`, icon: CreditCard },
        ].map((a, i) => {
          const Icon = a.icon
          return (
            <Link key={i} href={a.href} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-[#cd1419]" />
                <span className="font-medium text-sm text-gray-700">{a.label}</span>
              </div>
              <ArrowRight className={cn('h-4 w-4 text-gray-400', isRTL && 'rotate-180')} />
            </Link>
          )
        })}
      </div>
      {membership && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-2">{isRTL ? 'العضوية الحالية' : 'Current Membership'}</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-700">{membershipNameVal}</p>
              <p className="text-xs text-gray-500">{isRTL ? 'تنتهي في' : 'Expires'}: {new Date(membership.end_date).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US')}</p>
            </div>
            <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', membership.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
              {membership.status === 'active' ? (isRTL ? 'نشطة' : 'Active') : (isRTL ? 'منتهية' : 'Expired')}
            </span>
          </div>
        </div>
      )}
      {belt && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-2">{isRTL ? 'الرتبة الحالية' : 'Current Belt'}</h3>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-900 flex items-center justify-center"><Award className="h-5 w-5 text-yellow-400" /></div>
            <div>
              <p className="font-medium text-gray-700">{beltLabelVal} — {disciplineNameVal}</p>
              <p className="text-xs text-gray-500">{isRTL ? 'برو لاين جيم' : 'PRO LINE Gym'}</p>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-sm text-gray-900 mb-3">{isRTL ? 'آخر مرات الحضور' : 'Recent Attendance'}</h3>
        {recentAttendance && recentAttendance.length > 0 ? (
          <div className="space-y-2">
            {recentAttendance.map((ra: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700">{getCName(ra)}</p>
                  <p className="text-xs text-gray-500">{new Date(ra.attendance_date).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US')}</p>
                </div>
                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', statusColors[ra.status] || 'bg-gray-100 text-gray-700')}>
                  {statusLabels[ra.status] || ra.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">{isRTL ? 'لا توجد سجلات حضور بعد' : 'No attendance records yet'}</p>
        )}
      </div>
    </div>
  )
}
