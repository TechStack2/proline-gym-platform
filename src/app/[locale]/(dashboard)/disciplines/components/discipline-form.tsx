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

interface DisciplineFormProps {
  locale: string
  initialData?: any
}

export function DisciplineForm({ locale, initialData }: DisciplineFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('disciplines')
  const isRTL = locale === 'ar'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name_ar: initialData?.name_ar || '',
    name_en: initialData?.name_en || '',
    name_fr: initialData?.name_fr || '',
    description_ar: initialData?.description_ar || '',
    description_en: initialData?.description_en || '',
    description_fr: initialData?.description_fr || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: submitError } = await supabase
        .from('disciplines')
        .upsert({
          ...formData,
          id: initialData?.id,
        })
        .select()

      if (submitError) throw submitError

      router.push(`/${locale}/disciplines`)
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
          <div className="grid grid-cols-1 gap-4">
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
                {t('name_fr')} *
              </label>
              <Input
                required
                value={formData.name_fr}
                onChange={(e) => handleChange('name_fr', e.target.value)}
                placeholder={t('name_fr_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('description_ar')}
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 min-h-[80px]"
                value={formData.description_ar}
                onChange={(e) => handleChange('description_ar', e.target.value)}
                placeholder={t('description_ar_placeholder')}
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('description_en')}
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 min-h-[80px]"
                value={formData.description_en}
                onChange={(e) => handleChange('description_en', e.target.value)}
                placeholder={t('description_en_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('description_fr')}
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 min-h-[80px]"
                value={formData.description_fr}
                onChange={(e) => handleChange('description_fr', e.target.value)}
                placeholder={t('description_fr_placeholder')}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <div className="flex gap-2 justify-end">
            <Link href={`/${locale}/disciplines`}>
              <Button type="button" variant="outline">
                <ArrowLeft className="w-4 h-4 ml-2" />
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4 ml-2" />
                  {t('save')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

