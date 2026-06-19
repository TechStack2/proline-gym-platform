'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Phone, Calendar, Award, DollarSign, FolderOpen, Dumbbell } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MemberInfo, MembershipStatus } from '@/lib/members/enrichment'

const membershipTone: Record<MembershipStatus, string> = {
  active: 'bg-green-100 text-green-800',
  expiring: 'bg-amber-100 text-amber-800',
  lapsed: 'bg-red-100 text-red-700',
  none: 'bg-gray-100 text-gray-600',
}

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
  /** FD-1 row badges: student_id → soonest active-membership end date (≤7d). */
  expiringBy?: Record<string, string>
  /** FD-1 row badges: student ids with open (pending/partial/overdue) invoices. */
  owing?: string[]
  /** MEMBER-ENRICH: student_id → discipline(s)/class(es)/membership status. */
  memberInfo?: Record<string, MemberInfo>
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

export function StudentList({ students, locale, isRTL, expiringBy = {}, owing = [], memberInfo = {} }: StudentListProps) {
  const t = useTranslations('students')
  const router = useRouter()
  const owingSet = new Set(owing)

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
        const info = memberInfo[student.id]
        const hasInfo = info && (info.disciplines.length > 0 || info.classes.length > 0 || info.membershipStatus !== 'none')
        return (
          <div
            key={student.id}
            data-testid="student-card"
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/${locale}/students/${student.id}`)}
            onKeyDown={(e) => e.key === 'Enter' && router.push(`/${locale}/students/${student.id}`)}
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <h3 className={cn('font-semibold text-lg', isRTL && 'text-right')}>
                    {name || '—'}
                  </h3>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge className={status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {t(`status.${status}`)}
                    </Badge>
                    {expiringBy[student.id] && (
                      <Badge data-testid="badge-expiring" className="bg-amber-100 text-amber-800">
                        {t('badges.expiring')}
                      </Badge>
                    )}
                    {owingSet.has(student.id) && (
                      <Badge data-testid="badge-owing" className="bg-red-100 text-red-700">
                        {t('badges.owing')}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Award className="w-4 h-4" />
                    {student.current_belt_rank ? (
                      <Badge data-testid="member-belt" className={beltColor(student.current_belt_rank)}>
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

                {/* MEMBER-ENRICH info area — an ordered, one-query-fed chip set
                    (discipline · class · membership status). EXTENSION POINT:
                    incoming per-member fields drop in here as another chip block
                    (extend MemberInfo + the getMemberEnrichment read), no re-plumbing. */}
                {hasInfo && info && (
                  <div className="mt-3 flex flex-wrap gap-1.5" data-testid="member-info">
                    {info.disciplines.map((d) => (
                      <span key={`d-${d}`} data-testid="member-discipline" data-kind="discipline"
                        className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{d}</span>
                    ))}
                    {info.classes.map((c) => (
                      <span key={`c-${c}`} data-testid="member-class" data-kind="class"
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        <Dumbbell className="h-3 w-3" />{c}
                      </span>
                    ))}
                    {info.membershipStatus !== 'none' && (
                      <span data-testid="member-membership" data-status={info.membershipStatus}
                        className={cn('rounded-full px-2 py-0.5 text-xs font-medium', membershipTone[info.membershipStatus])}>
                        {t(`membership.${info.membershipStatus}`)}
                      </span>
                    )}
                  </div>
                )}

                {/* FD-1 row quick-actions: call · open file · record payment */}
                <div className="mt-3 flex gap-2 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} data-testid="row-call" dir="ltr"
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200">
                      <Phone className="h-3 w-3" /> {t('actions.call')}
                    </a>
                  )}
                  <Link href={`/${locale}/students/${student.id}`} data-testid="row-file"
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200">
                    <FolderOpen className="h-3 w-3" /> {t('actions.file')}
                  </Link>
                  <Link href={`/${locale}/students/${student.id}?pay=1`} data-testid="row-pay"
                    className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-[#cd1419] hover:bg-red-100">
                    <DollarSign className="h-3 w-3" /> {t('actions.pay')}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
