'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, ArrowLeft, Plus, Trash2 } from 'lucide-react'
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

interface MembershipPlan {
  id: string
  name: string
  price_usd: number
  price_lbp: number
  duration_days: number
  max_classes_per_week: number
  features?: string[]
}

interface InvoiceFormProps {
  students: Student[]
  membershipPlans: MembershipPlan[]
  locale: string
}

interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  currency: 'USD' | 'LBP'
}

export function InvoiceForm({ students, membershipPlans, locale }: InvoiceFormProps) {
  const t = useTranslations('invoices')
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    student_id: '',
    membership_plan_id: '',
    amount: '',
    currency: 'USD',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
  })
  
  const [items, setItems] = useState<InvoiceItem[]>([])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Generate invoice number
      const timestamp = Date.now().toString(36).toUpperCase()
      const random = Math.random().toString(36).substring(2, 5).toUpperCase()
      const invoiceNumber = `INV-${timestamp}-${random}`
      
      const { error } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        student_id: formData.student_id,
        membership_plan_id: formData.membership_plan_id || null,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        notes: formData.notes || null,
        status: 'draft',
      })
      
      if (error) throw error
      
      toast({
        title: t('invoice_generated'),
        description: t('invoice_generated_description'),
      })
      
      router.push(`/${locale}/invoices`)
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
    
    // Auto-fill amount when plan is selected
    if (field === 'membership_plan_id' && value) {
      const plan = membershipPlans.find(p => p.id === value)
      if (plan) {
        setFormData(prev => ({
          ...prev,
          amount: formData.currency === 'USD' ? plan.price_usd.toString() : plan.price_lbp.toString(),
        }))
      }
    }
  }
  
  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0, currency: 'USD' }])
  }
  
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }
  
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{t('invoice_details')}</CardTitle>
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
              <Label htmlFor="membership_plan_id">{t('membership_plan')}</Label>
              <Select
                value={formData.membership_plan_id}
                onValueChange={(value) => handleChange('membership_plan_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('select_plan')} />
                </SelectTrigger>
                <SelectContent>
                  {membershipPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">{t('amount')} *</Label>
            <Input
              id="amount"
              type="number"
              required
              value={formData.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="issue_date">{t('issue_date')}</Label>
              <Input
                id="issue_date"
                type="date"
                value={formData.issue_date}
                onChange={(e) => handleChange('issue_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">{t('due_date')}</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => handleChange('due_date', e.target.value)}
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
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Link href={`/${locale}/invoices`}>
              <Button type="button" variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {t('generate_invoice')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

