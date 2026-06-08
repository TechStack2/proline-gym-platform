'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Award, BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface BeltHierarchy {
  id: string
  name_ar: string
  name_en: string
  color: string
  order_index: number
}

interface Discipline {
  id: string
  name_ar: string
  name_en: string
  name_fr: string
  description_ar: string
  description_en: string
  description_fr: string
  belt_hierarchies: BeltHierarchy[]
}

interface DisciplineListProps {
  disciplines: Discipline[]
  locale: string
  isRTL: boolean
}

export function DisciplineList({ disciplines, locale, isRTL }: DisciplineListProps) {
  const t = useTranslations('disciplines')

  const getBeltColor = (color: string) => {
    const beltColors: Record<string, string> = {
      white: 'bg-white border border-gray-300',
      yellow: 'bg-yellow-400',
      orange: 'bg-orange-500',
      green: 'bg-green-600',
      blue: 'bg-blue-600',
      purple: 'bg-purple-600',
      brown: 'bg-amber-800',
      red: 'bg-red-700',
      black: 'bg-gray-900',
    }
    return beltColors[color] || 'bg-gray-100'
  }

  const getName = (discipline: Discipline) => {
    switch (locale) {
      case 'ar': return discipline.name_ar
      case 'fr': return discipline.name_fr
      default: return discipline.name_en
    }
  }

  const getDescription = (discipline: Discipline) => {
    switch (locale) {
      case 'ar': return discipline.description_ar
      case 'fr': return discipline.description_fr
      default: return discipline.description_en
    }
  }

  if (disciplines.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t('no_disciplines')}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {disciplines.map((discipline) => (
        <Link key={discipline.id} href={`/${locale}/disciplines/${discipline.id}`}>
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                <span>{getName(discipline)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {getDescription(discipline) && (
                <p className="text-sm text-gray-600 line-clamp-2">
                  {getDescription(discipline)}
                </p>
              )}

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  {t('belt_progression')}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {discipline.belt_hierarchies
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((belt) => (
                      <div
                        key={belt.id}
                        className={cn(
                          "w-6 h-6 rounded-full border-2 border-gray-300",
                          getBeltColor(belt.color)
                        )}
                        title={isRTL ? belt.name_ar : belt.name_en}
                      />
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}