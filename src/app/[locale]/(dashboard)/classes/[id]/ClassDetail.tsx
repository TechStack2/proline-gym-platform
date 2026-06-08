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
import { createClient } from '@/lib/supabase/client'

interface ClassDetailProps {
  classData: any
  locale: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ClassDetail({ classData, locale }: ClassDetailProps) {
  const t = useTranslations('classes')
  const router = useRouter()
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const isRTL = locale === 'ar'

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
      const { error } = await supabase
        .from('class_enrollments')
        .update({ status: 'cancelled' })
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
      </div>

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
                  <p className="font-medium">
                    {classData.coach?.first_name} {classData.coach?.last_name}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">{t('capacity')}</label>
                  <p className="font-medium">{classData.enrollments_count}/{classData.capacity}</p>
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
              <Button onClick={() => setShowEnrollModal(true)}>
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
                          <p className="font-medium">
                            {enrollment.student?.first_name} {enrollment.student?.last_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={getBeltColor(enrollment.student?.belt_rank || 'white')}>
                              {enrollment.student?.belt_rank}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {enrollment.student?.email}
                            </span>
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