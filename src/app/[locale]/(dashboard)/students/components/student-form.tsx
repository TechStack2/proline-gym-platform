'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Loader2, Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Discipline {
  id: string
  name: string
}

interface BeltRank {
  id: string
  name_ar: string
  name_en: string
  color?: string
}

interface Guardian {
  id: string
  name_ar: string
  name_en: string
  phone: string
}

interface StudentFormProps {
  disciplines: Discipline[]
  beltRanks: BeltRank[]
  guardians: Guardian[]
  locale: string
  gymId: string
  initialData?: any
}

export function StudentForm({ disciplines, beltRanks, guardians, locale, gymId, initialData }: StudentFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('students')
  const isRTL = locale === 'ar'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name_ar: initialData?.name_ar || '',
    name_en: initialData?.name_en || '',
    phone: initialData?.phone || '',
    date_of_birth: initialData?.date_of_birth || '',
    gender: initialData?.gender || 'male',
    discipline_id: initialData?.discipline_id || '',
    belt_rank: initialData?.belt_rank || '',
    guardian_id: initialData?.guardian_id || '',
    emergency_contact: initialData?.emergency_contact || '',
    medical_notes: initialData?.medical_notes || '',
    join_date: initialData?.join_date || new Date().toISOString().split('T')[0],
    status: initialData?.status || 'active',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: submitError } = await supabase
        .from('students')
        .upsert({
          ...formData,
          id: initialData?.id,
          gym_id: gymId,
        })
        .select()

      if (submitError) throw submitError

      router.push(`/${locale}/students`)
      router.refresh()
    } catch (err: any) {
      setError(err.message || t('error_saving'))
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('name_ar')} *
              </label>
              <Input
                required
                value={formData.name_ar}
                onChange={(e) => handleChange('name_ar', e.target.value)}
                placeholder={t('name_ar_placeholder')}
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('name_en')} *
              </label>
              <Input
                required
                value={formData.name_en}
                onChange={(e) => handleChange('name_en', e.target.value)}
                placeholder={t('name_en_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('phone')} *
              </label>
              <Input
                required
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+213 XXX XX XX XX"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('date_of_birth')}
              </label>
              <Input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => handleChange('date_of_birth', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('gender')}
              </label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.gender}
                onChange={(e) => handleChange('gender', e.target.value)}
              >
                <option value="male">{t('male')}</option>
                <option value="female">{t('female')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('discipline')} *
              </label>
              <select
                required
                className="w-full border rounded-md px-3 py-2"
                value={formData.discipline_id}
                onChange={(e) => handleChange('discipline_id', e.target.value)}
              >
                <option value="">{t('select_discipline')}</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('belt_rank')}
              </label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.belt_rank}
                onChange={(e) => handleChange('belt_rank', e.target.value)}
              >
                <option value="">{t('select_belt')}</option>
                {beltRanks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {isRTL ? b.name_ar : b.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('guardian')}
              </label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.guardian_id}
                onChange={(e) => handleChange('guardian_id', e.target.value)}
              >
                <option value="">{t('select_guardian')}</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isRTL ? g.name_ar : g.name_en} - {g.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('emergency_contact')}
              </label>
              <Input
                value={formData.emergency_contact}
                onChange={(e) => handleChange('emergency_contact', e.target.value)}
                placeholder={t('emergency_contact_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('join_date')}
              </label>
              <Input
                type="date"
                value={formData.join_date}
                onChange={(e) => handleChange('join_date', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('medical_notes')}
            </label>
            <textarea
              className="w-full border rounded-md px-3 py-2 min-h-[100px]"
              value={formData.medical_notes}
              onChange={(e) => handleChange('medical_notes', e.target.value)}
              placeholder={t('medical_notes_placeholder')}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <div className="flex gap-2 justify-end">
            <Link href={`/${locale}/students`}>
              <Button type="button" variant="outline">
                <ArrowLeft className="w-4 h-4 ml-2" />
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4 ml-2" />
              )}
              {t('save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}