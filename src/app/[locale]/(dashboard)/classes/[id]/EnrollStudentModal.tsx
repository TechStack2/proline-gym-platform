'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X, Search, Loader2, Check, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface EnrollStudentModalProps {
  classId: string
  locale: string
  onClose: () => void
  onSuccess: () => void
}

export default function EnrollStudentModal({ classId, locale, onClose, onSuccess }: EnrollStudentModalProps) {
  const t = useTranslations('classes')
  const [search, setSearch] = useState('')
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<any>(null)
  const isRTL = locale === 'ar'

  useEffect(() => {
    const searchStudents = async () => {
      if (!search.trim()) {
        setStudents([])
        return
      }

      setLoading(true)
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('students')
          .select('*')
          .eq('status', 'active')
          .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
          .limit(10)

        setStudents(data || [])
      } catch (err) {
        console.error('Error searching students:', err)
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(searchStudents, 300)
    return () => clearTimeout(debounce)
  }, [search])

  const handleEnroll = async () => {
    if (!selectedStudent) return

    setEnrolling(selectedStudent.id)
    setError('')

    try {
      const supabase = createClient()
      
      // Check if already enrolled
      const { data: existing } = await supabase
        .from('class_enrollments')
        .select('id')
        .eq('class_id', classId)
        .eq('student_id', selectedStudent.id)
        .eq('status', 'active')
        .single()

      if (existing) {
        throw new Error('Student is already enrolled in this class')
      }

      const { error: enrollError } = await supabase
        .from('class_enrollments')
        .insert({
          class_id: classId,
          student_id: selectedStudent.id,
          status: 'active',
        })

      if (enrollError) throw enrollError

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to enroll student')
    } finally {
      setEnrolling(null)
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={cn(
        "bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto",
        isRTL && "rtl"
      )}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">{t('enrollStudent')}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="relative">
            <Search className={cn(
              "absolute top-2.5 h-4 w-4 text-muted-foreground",
              isRTL ? "right-3" : "left-3"
            )} />
            <Input
              placeholder={t('searchStudents')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedStudent(null)
              }}
              className={cn(isRTL ? "pr-10" : "pl-10")}
              autoFocus
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && students.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {students.map((student) => (
                <div
                  key={student.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                    selectedStudent?.id === student.id
                      ? "bg-primary/10 border border-primary"
                      : "bg-gray-50 hover:bg-gray-100"
                  )}
                  onClick={() => setSelectedStudent(student)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {student.first_name} {student.last_name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={getBeltColor(student.belt_rank)}>
                          {student.belt_rank}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {student.email}
                        </span>
                      </div>
                    </div>
                  </div>
                  {selectedStudent?.id === student.id && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && search && students.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              {t('noStudentsFound')}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleEnroll}
              disabled={!selectedStudent || enrolling !== null}
            >
              {enrolling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('confirmEnroll')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}