'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Clock, MapPin, Users, Edit, Trash2, UserPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import EnrollStudentModal from './EnrollStudentModal'
import AddClassModal from '../AddClassModal'
import { createClient } from '@/lib/supabase/client'
import { localizedName } from '@/lib/names'
import { RegistrationsPanel } from './RegistrationsPanel'

interface ClassDetailProps {
  classData: any
  locale: string
  registrations?: Array<{ id: string; status: string; waitlist_position: number | null; monthly_fee_usd: number | null; invoice_id: string | null; studentName: string }>
  students?: { id: string; name: string }[]
  /** ADM-1 admin bar inputs */
  disciplines?: any[]
  coaches?: any[]
  activeRegCount?: number
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ClassDetail({ classData, locale, registrations = [], students = [], disciplines = [], coaches = [], activeRegCount = 0 }: ClassDetailProps) {
  const t = useTranslations('classes')
  const router = useRouter()
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [showEditWizard, setShowEditWizard] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [adminBusy, setAdminBusy] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const isRTL = locale === 'ar'
  const tw = useTranslations('classes.wizard')
  const ta = useTranslations('classes.admin')

  // ── ADM-1 catalog actions (archive-not-delete; publish gates the anon landing) ──
  const togglePublish = async () => {
    setAdminBusy(true)
    const supabase = createClient()
    await supabase.from('classes').update({ show_on_landing: !classData.show_on_landing }).eq('id', classData.id)
    setAdminBusy(false)
    router.refresh()
  }

  const archiveClass = async () => {
    setAdminBusy(true)
    const supabase = createClient()
    // NEVER hard-delete: the class leaves the timetable/landing/chips, history stays.
    const { error } = await supabase.from('classes')
      .update({ is_active: false, show_on_landing: false, status: 'cancelled' })
      .eq('id', classData.id)
    setAdminBusy(false)
    if (!error) router.push(`/${locale}/classes`)
  }

  const getBeltColor = (belt: string) => {
    const colors: { [key: string]: string } = {
      white: 'bg-gray-100 text-gray-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      orange: 'bg-orange-100 text-orange-800',
      green: 'bg-green-100 text-green-800',
      blue: 'bg-blue-100 text-blue-800',
      purple: 'bg-purple-100 text-purple-800',
      brown: 'bg-amber-100 text-amber-800',
      red: 'bg-red-100 text-red-800',
      black: 'bg-gray-900 text-white',
    }
    return colors[belt.toLowerCase()] || 'bg-gray-100 text-gray-800'
  }

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    if (!confirm('Are you sure you want to remove this student from the class?')) return
    
    setRemovingId(enrollmentId)
    try {
      const supabase = createClient()
      // Real schema: roster membership is the is_active boolean (no status col).
      const { error } = await supabase
        .from('class_enrollments')
        .update({ is_active: false })
        .eq('id', enrollmentId)

      if (error) throw error
      router.refresh()
    } catch (err) {
      console.error('Error removing enrollment:', err)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {classData[`name_${locale}`] || classData.name_en}
        </h1>
        <Badge variant={classData.status === 'active' ? 'default' : 'secondary'}>
          {classData.status}
        </Badge>
        {!classData.is_active && (
          <Badge variant="secondary" data-testid="class-archived-badge">{ta('archived')}</Badge>
        )}
      </div>

      {/* ── ADM-1 admin bar: publish · edit · archive ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm" data-testid="class-admin-bar">
        <button type="button" data-testid="class-publish-toggle" data-on={!!classData.show_on_landing}
          disabled={adminBusy || !classData.is_active}
          onClick={togglePublish}
          className="flex items-center gap-2 rounded-xl border px-3 py-2 disabled:opacity-50">
          <span className={cn('relative h-6 w-11 rounded-full transition-colors', classData.show_on_landing ? 'bg-[#cd1419]' : 'bg-gray-200')}>
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', classData.show_on_landing ? (isRTL ? 'right-5' : 'left-5') : (isRTL ? 'right-0.5' : 'left-0.5'))} />
          </span>
          <span className="text-sm font-medium text-gray-800">
            {classData.show_on_landing ? tw('published') : tw('showOnLanding')}
          </span>
        </button>
        <Button variant="outline" size="sm" data-testid="class-edit-btn" disabled={adminBusy}
          onClick={() => setShowEditWizard(true)}>
          <Edit className="mr-1 h-4 w-4" /> {ta('edit')}
        </Button>
        {classData.is_active && (
          confirmArchive ? (
            <span className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="archive-confirm-box">
              {activeRegCount > 0 ? ta('archiveWarnRegs', { count: activeRegCount }) : ta('archiveConfirm')}
              <Button size="sm" variant="outline" data-testid="class-archive-confirm" disabled={adminBusy}
                className="border-red-300 text-red-700 hover:bg-red-100" onClick={archiveClass}>
                {ta('archiveYes')}
              </Button>
              <Button size="sm" variant="ghost" data-testid="class-archive-cancel" onClick={() => setConfirmArchive(false)}>
                {ta('cancel')}
              </Button>
            </span>
          ) : (
            <Button variant="outline" size="sm" data-testid="class-archive-btn" disabled={adminBusy}
              className="text-red-600 hover:bg-red-50" onClick={() => setConfirmArchive(true)}>
              <Trash2 className="mr-1 h-4 w-4" /> {ta('archive')}
            </Button>
          )
        )}
      </div>

      {showEditWizard && (
        <AddClassModal
          disciplines={disciplines}
          coaches={coaches}
          locale={locale}
          onClose={() => setShowEditWizard(false)}
          onSuccess={() => { setShowEditWizard(false); router.refresh() }}
          editClass={{
            id: classData.id,
            name_en: classData.name_en,
            name_ar: classData.name_ar,
            name_fr: classData.name_fr,
            discipline_id: classData.discipline_id,
            coach_id: classData.coach_id,
            max_capacity: classData.max_capacity,
            monthly_fee_usd: classData.monthly_fee_usd,
            status: classData.status,
            show_on_landing: classData.show_on_landing,
            schedules: (classData.schedules ?? []).map((x: any) => ({
              day_of_week: x.day_of_week, start_time: x.start_time, end_time: x.end_time,
            })),
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('classInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {classData.description && (
                <p className="text-muted-foreground">{classData.description}</p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">{t('discipline')}</label>
                  <p className="font-medium">
                    {classData.discipline?.[`name_${locale}`] || classData.discipline?.name_en}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">{t('coach')}</label>
                  <p className="font-medium" data-testid="detail-coach">
                    {localizedName(classData.coach?.profiles, locale)}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">{t('capacity')}</label>
                  <p className="font-medium">{classData.enrollments_count}/{classData.max_capacity}</p>
                </div>
              </div>

              {classData.schedules && classData.schedules.length > 0 && (
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">{t('schedule')}</label>
                  <div className="space-y-2">
                    {classData.schedules.map((schedule: any) => (
                      <div key={schedule.id} className="flex items-center gap-4 text-sm p-2 bg-gray-50 rounded">
                        <span className="font-medium">{DAYS[schedule.day_of_week]}</span>
                        <span className="text-muted-foreground">
                          {schedule.start_time} - {schedule.end_time}
                        </span>
                        {schedule.room && (
                          <span className="text-muted-foreground">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            {schedule.room}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enrolled Students */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('enrolledStudents')} ({classData.enrollments_count})</CardTitle>
              <Button data-testid="enroll-open" onClick={() => setShowEnrollModal(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t('enrollStudent')}
              </Button>
            </CardHeader>
            <CardContent>
              {classData.enrollments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {t('noEnrollments')}
                </p>
              ) : (
                <div className="space-y-3">
                  {classData.enrollments.map((enrollment: any) => (
                    <div
                      key={enrollment.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid="enrolled-student">
                            {localizedName(enrollment.student?.profiles, locale)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={getBeltColor(enrollment.student?.current_belt_rank || 'white')}>
                              {enrollment.student?.current_belt_rank}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveEnrollment(enrollment.id)}
                        disabled={removingId === enrollment.id}
                        className="text-red-500 hover:text-red-700"
                      >
                        {removingId === enrollment.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* B2 — recurring-class registrations (request → approve → bill → waitlist) */}
          <RegistrationsPanel
            classId={classData.id}
            registrations={registrations}
            students={students}
            locale={locale}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                {t('editClass')}
              </Button>
              <Button className="w-full" variant="outline" onClick={() => setShowEnrollModal(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t('enrollStudent')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {showEnrollModal && (
        <EnrollStudentModal
          classId={classData.id}
          locale={locale}
          onClose={() => setShowEnrollModal(false)}
          onSuccess={() => {
            setShowEnrollModal(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}