'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Discipline { id: string; name: string }
interface BeltRank { id: string; name_ar: string; name_en: string; color?: string }
interface Guardian { id: string; name_ar: string; name_en: string; phone: string }

interface StudentFormProps {
  // disciplines/beltRanks/guardians are still passed by the page but are not part
  // of the students identity write path (see F1.1 notes) — kept for signature compat.
  disciplines: Discipline[]
  beltRanks: BeltRank[]
  guardians: Guardian[]
  locale: string
  gymId: string
  initialData?: any
}

export function StudentForm({ locale, initialData }: StudentFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('students')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name_ar: initialData?.name_ar || '',
    name_en: initialData?.name_en || '',
    phone: initialData?.phone || '',
    date_of_birth: initialData?.date_of_birth || '',
    gender: initialData?.gender || 'male',
    emergency_contact: initialData?.emergency_contact || '',
    medical_notes: initialData?.medical_notes || '',
    join_date: initialData?.join_date || new Date().toISOString().split('T')[0],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Map the form to the profiles → students identity chain. Names are single
    // fields here, so they go to first_name_*; last_name_* are left empty.
    const args = {
      p_first_name_ar: formData.name_ar || formData.name_en,
      p_first_name_en: formData.name_en,
      p_first_name_fr: formData.name_en,
      p_last_name_ar: '',
      p_last_name_en: '',
      p_last_name_fr: '',
      p_phone: formData.phone,
      p_gender: (formData.gender || null) as 'male' | 'female' | 'other' | null,
      p_date_of_birth: formData.date_of_birth || null,
      p_emergency_contact_name: formData.emergency_contact || null,
      p_emergency_contact_phone: null,
      p_medical_notes: formData.medical_notes || null,
      p_join_date: formData.join_date || null,
      p_current_belt_rank: null,
    }

    try {
      const { error: rpcError } = initialData?.id
        ? await supabase.rpc('update_student', { p_student_id: initialData.id, ...args })
        : await supabase.rpc('create_student', args)

      if (rpcError) throw rpcError

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
              <label className="block text-sm font-medium mb-1">{t('name_ar')} *</label>
              <Input
                required
                value={formData.name_ar}
                onChange={(e) => handleChange('name_ar', e.target.value)}
                placeholder={t('name_ar_placeholder')}
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('name_en')} *</label>
              <Input
                required
                value={formData.name_en}
                onChange={(e) => handleChange('name_en', e.target.value)}
                placeholder={t('name_en_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('phone')} *</label>
              <Input
                required
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+961 XX XXX XXX"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('date_of_birth')}</label>
              <Input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => handleChange('date_of_birth', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('gender')}</label>
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
              <label className="block text-sm font-medium mb-1">{t('emergency_contact')}</label>
              <Input
                value={formData.emergency_contact}
                onChange={(e) => handleChange('emergency_contact', e.target.value)}
                placeholder={t('emergency_contact_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('join_date')}</label>
              <Input
                type="date"
                value={formData.join_date}
                onChange={(e) => handleChange('join_date', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('medical_notes')}</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 min-h-[100px]"
              value={formData.medical_notes}
              onChange={(e) => handleChange('medical_notes', e.target.value)}
              placeholder={t('medical_notes_placeholder')}
            />
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="flex gap-2 justify-end">
            <Link href={`/${locale}/students`}>
              <Button type="button" variant="outline">
                <ArrowLeft className="w-4 h-4 ml-2" />
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
              {t('save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
