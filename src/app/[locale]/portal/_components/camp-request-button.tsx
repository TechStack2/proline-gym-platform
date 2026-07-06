'use client'

/**
 * Camp request (E1) — member-self or guardian acting for a kid (B3 banner
 * copy). Goes through the request_camp SECURITY DEFINER RPC (pending row,
 * NO invoice) → staff Inbox → approve via register_camp.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Send } from 'lucide-react'

export function CampRequestButton({ campId, studentId, actingFor, locale }: {
  campId: string
  studentId: string
  actingFor: string | null
  locale: string
}) {
  const t = useTranslations('campsPortal')
  const tc = useTranslations('common')
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const request = async () => {
    setBusy(true)
    const { error } = await createClient().rpc('request_camp', {
      p_camp_id: campId,
      p_student_id: studentId,
    })
    setBusy(false)
    if (error) { console.error('[camp-request]', error); toast.error(tc('genericError')) } // ERROR-HARDEN
    else {
      toast.success(t('requested'))
      router.refresh()
    }
  }

  return (
    <button type="button" data-testid="portal-camp-request" disabled={busy} onClick={request}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      {actingFor ? t('requestFor', { name: actingFor }) : t('request')}
    </button>
  )
}
