'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { localizedName } from '@/lib/names'

interface AddClassModalProps {
  disciplines: any[]
  coaches: any[]
  locale: string
  onClose: () => void
  onSuccess: () => void
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface ScheduleEntry {
  day_of_week: number
  start_time: string
  end_time: string
  room: string
}

export default function AddClassModal({ disciplines, coaches, locale, onClose, onSuccess }: AddClassModalProps) {
  const t = useTranslations('classes')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([
    { day_of_week: 1, start_time: '09:00', end_time: '10:00', room: '' }
  ])
  const isRTL = locale === 'ar'

  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    name_fr: '',
    discipline_id: '',
    coach_id: '',
    description: '',
    capacity: 20,
    monthly_fee_usd: '',
    status: 'scheduled' as const,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      
      // Validate required fields
      if (!formData.name_en || !formData.discipline_id || !formData.coach_id) {
        throw new Error('Please fill in all required fields')
      }

      // Insert class
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .insert({
          name_ar: formData.name_ar,
          name_en: formData.name_en,
          name_fr: formData.name_fr,
          discipline_id: formData.discipline_id,
          coach_id: formData.coach_id,
          // Real schema: localized description_* + max_capacity (not description/capacity).
          description_ar: formData.description,
          description_en: formData.description,
          description_fr: formData.description,
          max_capacity: formData.capacity,
          monthly_fee_usd: formData.monthly_fee_usd ? parseFloat(formData.monthly_fee_usd) : null,
          status: formData.status,
        })
        .select()
        .single()

      if (classError) throw classError

      // Insert schedules
      const validSchedules = schedules.filter(s => s.start_time && s.end_time)
      if (validSchedules.length > 0) {
        const { error: scheduleError } = await supabase
          .from('class_schedules')
          .insert(
            validSchedules.map(s => ({
              class_id: classData.id,
              day_of_week: s.day_of_week,
              start_time: s.start_time,
              end_time: s.end_time,
              room: s.room,
            }))
          )

        if (scheduleError) throw scheduleError
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the class')
    } finally {
      setLoading(false)
    }
  }

  const addSchedule = () => {
    setSchedules([...schedules, { day_of_week: 1, start_time: '09:00', end_time: '10:00', room: '' }])
  }

  const removeSchedule = (index: number) => {
    setSchedules(schedules.filter((_, i) => i !== index))
  }

  const updateSchedule = (index: number, field: keyof ScheduleEntry, value: any) => {
    const newSchedules = [...schedules]
    newSchedules[index] = { ...newSchedules[index], [field]: value }
    setSchedules(newSchedules)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={cn(
        "bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",
        isRTL && "rtl"
      )}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">{t('addClass')}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('nameEn')} *
              </label>
              <Input
                data-testid="class-name-en"
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('nameAr')}
              </label>
              <Input
                value={formData.name_ar}
                onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                dir="rtl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('nameFr')}
              </label>
              <Input
                value={formData.name_fr}
                onChange={(e) => setFormData({ ...formData, name_fr: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('discipline')} *
              </label>
              {/* Native select (e2e-deterministic; Radix triggers are flaky under
                  the (dashboard) double-shell — they intercept the open click). */}
              <select
                data-testid="class-discipline"
                value={formData.discipline_id}
                onChange={(e) => setFormData({ ...formData, discipline_id: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('selectDiscipline')}</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>{d[`name_${locale}`] || d.name_en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('coach')} *
              </label>
              <select
                data-testid="class-coach-select"
                value={formData.coach_id}
                onChange={(e) => setFormData({ ...formData, coach_id: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('selectCoach')}</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{localizedName(c.profiles, locale)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('capacity')}
              </label>
              <Input
                type="number"
                min="1"
                max="100"
                data-testid="class-capacity"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 20 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {locale === 'ar' ? 'الرسوم الشهرية (دولار)' : locale === 'fr' ? 'Frais mensuels (USD)' : 'Monthly fee (USD)'}
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                data-testid="class-monthly-fee"
                placeholder="0.00"
                value={formData.monthly_fee_usd}
                onChange={(e) => setFormData({ ...formData, monthly_fee_usd: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('status')}
              </label>
              <Select
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('description')}
            </label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* Schedules */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">{t('schedules')}</label>
              <Button type="button" variant="outline" size="sm" onClick={addSchedule}>
                <Plus className="h-4 w-4 mr-1" />
                {t('addSchedule')}
              </Button>
            </div>
            <div className="space-y-3">
              {schedules.map((schedule, index) => (
                <div key={index} className="flex items-end gap-2 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <label className="block text-xs text-muted-foreground mb-1">{t('day')}</label>
                    <Select
                      value={schedule.day_of_week.toString()}
                      onValueChange={(value) => updateSchedule(index, 'day_of_week', parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map((day, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('startTime')}</label>
                    <Input
                      type="time"
                      value={schedule.start_time}
                      onChange={(e) => updateSchedule(index, 'start_time', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('endTime')}</label>
                    <Input
                      type="time"
                      value={schedule.end_time}
                      onChange={(e) => updateSchedule(index, 'end_time', e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-muted-foreground mb-1">{t('room')}</label>
                    <Input
                      value={schedule.room}
                      onChange={(e) => updateSchedule(index, 'room', e.target.value)}
                      placeholder={t('roomPlaceholder')}
                    />
                  </div>
                  {schedules.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSchedule(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" data-testid="class-submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('create')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}