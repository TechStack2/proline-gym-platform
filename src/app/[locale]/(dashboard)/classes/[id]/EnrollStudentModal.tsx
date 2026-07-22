'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { X, Search, Loader2, Check, Users } from 'lucide-react'
import { ModalPortal } from '@/components/shared/modal-portal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { enrollStudent } from './actions'
import { useErrorText } from '@/lib/errors/use-error-text';
import { beltRankLabel, beltSwatchClass } from '@/lib/belts/label'

interface EnrollStudentModalProps {
  classId: string
  locale: string
  onClose: () => void
  onSuccess: () => void
}

type ProfileShape = {
  first_name_ar: string | null; first_name_en: string | null; first_name_fr: string | null
  last_name_ar: string | null; last_name_en: string | null; last_name_fr: string | null
  phone: string | null
}
type StudentRow = { id: string; current_belt_rank: string | null; profiles: ProfileShape | ProfileShape[] | null }

function profileOf(s: StudentRow): ProfileShape | null {
  return Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
}
function nameOf(s: StudentRow, locale: string): string {
  const p = profileOf(s)
  if (!p) return ''
  const fn = (p as Record<string, string | null>)[`first_name_${locale}`] || p.first_name_en || ''
  const ln = (p as Record<string, string | null>)[`last_name_${locale}`] || p.last_name_en || ''
  return `${fn} ${ln}`.trim()
}

export default function EnrollStudentModal({ classId, locale, onClose, onSuccess }: EnrollStudentModalProps) {
  const t = useTranslations('classes')
  // DA-9: belt ranks reach the DOM only via the one belt vocabulary.
  const tb = useTranslations('beltRanks')
  const errText = useErrorText();
  const [search, setSearch] = useState('')
  const [allStudents, setAllStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [error, setError] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null)

  // Students are normalized via profiles; the legacy embedded-column .or() search
  // does not filter through PostgREST, so fetch the gym's students once and
  // filter client-side by the localized name.
  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('students')
        .select(`
          id, current_belt_rank,
          profiles!inner (
            first_name_ar, first_name_en, first_name_fr,
            last_name_ar, last_name_en, last_name_fr, phone
          )
        `)
        .eq('is_active', true)
        .limit(200)
      if (active) {
        setAllStudents((data || []) as StudentRow[])
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allStudents.slice(0, 12)
    return allStudents
      .filter((s) => {
        const p = profileOf(s)
        const hay = [
          nameOf(s, locale),
          p?.first_name_en, p?.last_name_en, p?.first_name_ar, p?.last_name_ar, p?.phone,
        ].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 12)
  }, [search, allStudents, locale])

  const handleEnroll = async () => {
    if (!selectedStudent) return
    setEnrolling(true)
    setError('')
    const res = await enrollStudent({ classId, studentId: selectedStudent.id })
    setEnrolling(false)
    if (res.ok) {
      onSuccess()
    } else {
      setError(errText(res.error))
    }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        data-testid="enroll-modal"
        className={cn('bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto')}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">{t('enrollStudent')}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="tint-danger p-3 rounded-md text-sm">{error}</div>}

          <div className="relative">
            <Search className="absolute top-2.5 start-3 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="enroll-search"
              placeholder={t('searchStudents')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedStudent(null) }}
              className="ps-10"
              autoFocus
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filtered.map((student) => {
                const name = nameOf(student, locale)
                return (
                  <div
                    key={student.id}
                    data-testid="enroll-student-row"
                    data-student-name={name}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors',
                      selectedStudent?.id === student.id ? 'bg-primary/10 border border-primary' : 'bg-gray-50 hover:bg-gray-100',
                    )}
                    onClick={() => setSelectedStudent(student)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{name || '—'}</p>
                        {student.current_belt_rank && (
                          /* DA-9/DA-43: belt label via the vocabulary + the belt's OWN swatch. */
                          <Badge variant="outline" className="gap-1">
                            <span className={cn('h-2 w-2 rounded-full', beltSwatchClass(student.current_belt_rank))} aria-hidden />
                            {beltRankLabel(student.current_belt_rank, (k) => tb(k as never), '')}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {selectedStudent?.id === student.id && <Check className="h-5 w-5 text-primary" />}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && search && filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-4">{t('noStudentsFound')}</p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button data-testid="enroll-confirm" onClick={handleEnroll} disabled={!selectedStudent || enrolling}>
              {enrolling && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {t('confirmEnroll')}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
