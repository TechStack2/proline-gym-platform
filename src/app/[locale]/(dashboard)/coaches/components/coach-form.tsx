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

interface CoachFormProps {
  disciplines: Discipline[]
  locale: string
  initialData?: any
}

export function CoachForm({ disciplines, locale, initialData }: CoachFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('coaches')
  const isRTL = locale === 'ar'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name_ar: initialData?.name_ar || '',
    name_en: initialData?.name_en || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    specialization: initialData?.specialization || '',
    bio: initialData?.bio || '',
    status: initialData?.status || 'active',
    disciplines: initialData?.coach_disciplines?.map((cd: any) => cd.discipline_id) || [],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Insert coach
      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .upsert({
          name_ar: formData.name_ar,
          name_en: formData.name_en,
          phone: formData.phone,
          email: formData.email,
          specialization: formData.specialization,
          bio: formData.bio,
          status: formData.status,
          id: initialData?.id,
        })
        .select()
        .single()

      if (coachError) throw coachError

      // Update coach disciplines
      if (initialData?.id) {
        await supabase
          .from('coach_disciplines')
          .delete()
          .eq('coach_id', initialData.id)
      }

      const disciplineInserts = formData.disciplines.map((disciplineId: string) => ({
        coach_id: coach.id,
        discipline_id: disciplineId,
      }))

      if (disciplineInserts.length > 0) {
        const { error: discError } = await supabase
          .from('coach_disciplines')
          .insert(disciplineInserts)

        if (discError) throw discError
      }

      router.push(`/${locale}/coaches`)
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

  const toggleDiscipline = (disciplineId: string) => {
    setFormData(prev => ({
      ...prev,
      disciplines: prev.disciplines.includes(disciplineId)
        ? prev.disciplines.filter((d: string) => d !== disciplineId)
        : [...prev.disciplines, disciplineId],
    }))
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
                {t('email')}
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="coach@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('specialization')}
              </label>
              <Input
                value={formData.specialization}
                onChange={(e) => handleChange('specialization', e.target.value)}
                placeholder={t('specialization_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('status_label')}
              </label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
              >
                <option value="active">{t('status.active')}</option>
                <option value="inactive">{t('status.inactive')}</option>
                <option value="on_leave">{t('status.on_leave')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {t('disciplines')} *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {disciplines.map((discipline) => (
                <label
                  key={discipline.id}
                  className={cn(
                    "flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-gray-50",
                    formData.disciplines.includes(discipline.id) && "bg-primary/10 border-primary"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={formData.disciplines.includes(discipline.id)}
                    onChange={() => toggleDiscipline(discipline.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{discipline.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('bio')}
            </label>
            <textarea
              className="w-full border rounded-md px-3 py-2 min-h-[100px]"
              value={formData.bio}
              onChange={(e) => handleChange('bio', e.target.value)}
              placeholder={t('bio_placeholder')}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <div className="flex gap-2 justify-end">
            <Link href={`/${locale}/coaches`}>
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