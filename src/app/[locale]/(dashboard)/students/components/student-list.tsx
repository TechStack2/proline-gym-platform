'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Calendar, Award } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Matches the server query in students/page.tsx:
//   select('*, profiles!inner(first_name_*, last_name_*, phone, avatar_url)')
// i.e. students columns + a nested `profiles` object. (No disciplines/guardians
// are joined, so we don't render them.)
interface ProfileShape {
  first_name_ar?: string | null
  first_name_en?: string | null
  first_name_fr?: string | null
  last_name_ar?: string | null
  last_name_en?: string | null
  last_name_fr?: string | null
  phone?: string | null
}

interface Student {
  id: string
  is_active: boolean
  join_date: string
  current_belt_rank?: string | null
  profiles?: ProfileShape | ProfileShape[] | null
}

interface StudentListProps {
  students: Student[]
  locale: string
  isRTL: boolean
}

function profileOf(s: Student): ProfileShape {
  const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
  return p || {}
}

function localized(p: ProfileShape, base: 'first_name' | 'last_name', locale: string): string {
  const order = locale === 'ar' ? ['ar', 'en', 'fr'] : locale === 'fr' ? ['fr', 'en', 'ar'] : ['en', 'ar', 'fr']
  for (const l of order) {
    const v = p[`${base}_${l}` as keyof ProfileShape]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

export function StudentList({ students, locale, isRTL }: StudentListProps) {
  const t = useTranslations('students')

  if (students.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t('no_students')}
      </div>
    )
  }

  const beltColor = (rank: string): string => {
    const base = rank.split('_')[0]
    const beltColors: Record<string, string> = {
      white: 'bg-white border border-gray-300 text-gray-800',
      yellow: 'bg-yellow-400 text-yellow-900',
      orange: 'bg-orange-500 text-white',
      green: 'bg-green-600 text-white',
      blue: 'bg-blue-600 text-white',
      purple: 'bg-purple-600 text-white',
      brown: 'bg-amber-800 text-white',
      red: 'bg-red-700 text-white',
      black: 'bg-gray-900 text-white',
    }
    return beltColors[base] || 'bg-gray-100 text-gray-800'
  }

  const beltLabel = (rank: string) => rank.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {students.map((student) => {
        const p = profileOf(student)
        const name = [localized(p, 'first_name', locale), localized(p, 'last_name', locale)].filter(Boolean).join(' ').trim()
        const status = student.is_active ? 'active' : 'inactive'
        return (
          <Link key={student.id} href={`/${locale}/students/${student.id}`} data-testid="student-card">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className={cn('font-semibold text-lg', isRTL && 'text-right')}>
                    {name || '—'}
                  </h3>
                  <Badge className={status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {t(`status.${status}`)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Award className="w-4 h-4" />
                    {student.current_belt_rank ? (
                      <Badge className={beltColor(student.current_belt_rank)}>
                        {beltLabel(student.current_belt_rank)}
                      </Badge>
                    ) : (
                      <span>{t('no_belt')}</span>
                    )}
                  </div>

                  {p.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span dir="ltr">{p.phone}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(student.join_date).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
