'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'

interface Student {
  id: string
  first_name: string
  last_name: string
}

interface PaymentFormProps {
  students: Student[]
  locale: string
}

export function PaymentForm({ students, locale }: PaymentFormProps) {
  const t = useTranslations('payments')
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    student_id: '',
    amount: '',
    currency: 'USD',
    payment_method: 'cash',
    reference_number: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  })
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const { error } = await supabase.from('payments').insert({
        student_id: formData.student_id,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        payment_method: formData.payment_method,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null,
        payment_date: formData.payment_date,
        status: 'completed',
      })
      
      if (error) throw error
      
      toast({
        title: t('payment_recorded'),
        description: t('payment_recorded_description'),
      })
      
      router.push(`/${locale}/payments`)
      router.refresh()
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{t('payment_details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="student_id">{t('student')} *</Label>
              <Select
                value={formData.student_id}
                onValueChange={(value) => handleChange('student_id', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('select_student')} />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.first_name} {student.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">{t('amount')} *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                required
                placeholder="0.00"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="currency">{t('currency')} *</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => handleChange('currency', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="LBP">LBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="payment_method">{t('payment_method')} *</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) => handleChange('payment_method', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('cash')}</SelectItem>
                  <SelectItem value="card">{t('card')}</SelectItem>
                  <SelectItem value="transfer">{t('transfer')}</SelectItem>
                  <SelectItem value="check">{t('check')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reference_number">{t('reference_number')}</Label>
              <Input
                id="reference_number"
                value={formData.reference_number}
                onChange={(e) => handleChange('reference_number', e.target.value)}
                placeholder={t('reference_number_placeholder')}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="payment_date">{t('payment_date')} *</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => handleChange('payment_date', e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">{t('notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder={t('notes_placeholder')}
              rows={3}
            />
          </div>
          
          <div className="flex gap-4">
            <Link href={`/${locale}/payments`}>
              <Button type="button" variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={loading} className="bg-[#cd1419] hover:bg-[#a81014]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t('save_payment')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}