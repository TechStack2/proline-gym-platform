'use client'

/**
 * G1 WhatsApp settings card (Settings → Configuration). Status badge + write-
 * only credential fields (the token is sent to a server action, never read
 * back) + a "send test" + the "until active, use the share buttons" explainer.
 * The access token is NEVER fetched to the client — only status is read.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MessageCircle, Check, Loader2, ShieldCheck } from 'lucide-react'
import { saveWhatsAppConfig, sendWhatsAppTest, type WhatsAppStatus } from './whatsapp-actions'

const TONE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  not_configured: 'bg-gray-100 text-gray-500',
}

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was remounting its subtree each render.
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

export function WhatsAppSettings({ initial, locale }: { initial: WhatsAppStatus; locale: string }) {
  const t = useTranslations('whatsappSettings')
  const isRTL = locale === 'ar'
  const router = useRouter()

  const [status, setStatus] = useState(initial.status)
  const [phoneNumberId, setPhoneNumberId] = useState(initial.phoneNumberId ?? '')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('') // write-only; never prefilled
  const [country, setCountry] = useState(initial.defaultCountryCode)
  const [testPhone, setTestPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setSaved(false)
    const res = await saveWhatsAppConfig({ phoneNumberId, wabaId, accessToken, defaultCountryCode: country })
    setBusy(false)
    if (res.ok) { setStatus(res.status); setSaved(true); setAccessToken(''); router.refresh() }
  }

  const test = async () => {
    setBusy(true); setTestResult(null)
    const res = await sendWhatsAppTest(testPhone)
    setBusy(false)
    setTestResult(res.ok ? (res.dispatched ? t('testSent') : t('testInactive')) : t('testFailed'))
  }

  return (
    <div className={cn('rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3', isRTL && 'rtl text-right')} data-testid="whatsapp-settings">
      <div className="flex items-center justify-between">
        <h3 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <MessageCircle className="h-4 w-4 text-[#25D366]" /> {t('title')}
        </h3>
        <span data-testid="whatsapp-status" data-status={status}
          className={cn('rounded-full px-2.5 py-1 text-xs font-medium', TONE[status] ?? TONE.not_configured)}>
          {t(`status.${status}` as Parameters<typeof t>[0])}
        </span>
      </div>

      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500" data-testid="whatsapp-explainer">{t('explainer')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <F label={t('phoneNumberId')}><Input data-testid="wa-phone-id" dir="ltr" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} /></F>
        <F label={t('wabaId')}><Input data-testid="wa-waba-id" dir="ltr" value={wabaId} onChange={(e) => setWabaId(e.target.value)} /></F>
        <F label={t('accessToken')}>
          <Input data-testid="wa-token" type="password" dir="ltr" autoComplete="off" placeholder={initial.configured ? '••••••••' : ''}
            value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
        </F>
        <F label={t('countryCode')}><Input data-testid="wa-country" dir="ltr" value={country} onChange={(e) => setCountry(e.target.value)} /></F>
      </div>
      <p className="flex items-center gap-1 text-2xs text-gray-400"><ShieldCheck className="h-3 w-3" /> {t('tokenNote')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" data-testid="wa-save" disabled={busy} onClick={save} className="bg-[#cd1419] hover:bg-[#a81014]">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} {t('save')}
        </Button>
        {saved && <span data-testid="wa-saved" className="text-xs font-medium text-green-600">{t('savedOk')}</span>}
      </div>

      {status === 'active' && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Input data-testid="wa-test-phone" dir="ltr" placeholder="+961…" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="h-9 w-44" />
          <Button size="sm" variant="outline" data-testid="wa-send-test" disabled={busy || !testPhone} onClick={test}>
            <MessageCircle className="mr-1 h-3.5 w-3.5" /> {t('sendTest')}
          </Button>
          {testResult && <span data-testid="wa-test-result" className="text-xs text-gray-600">{testResult}</span>}
        </div>
      )}
    </div>
  )
}
