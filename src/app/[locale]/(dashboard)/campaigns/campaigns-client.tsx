'use client'

/**
 * GRW-1 Campaigns (staff). Create via the shared FormWizard (name → source
 * chips), then each campaign shows its tracked link (/{locale}?c=CODE) with a
 * copy button, a client-side QR (the `qrcode` dep → data-URL <img>, ready to
 * screenshot into an IG post/flyer), and its lifetime stats (leads → trials →
 * conversions). Archive pattern. Follows docs/design-system.md.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { FormWizard, ChipRow } from '@/components/shared/form-wizard'
import { Plus, Copy, Check, Archive, ArchiveRestore, QrCode } from 'lucide-react'
import { createCampaign, setCampaignActive } from './actions'
import { PageHeader } from '@/components/ui/page-header';

const SOURCES = ['instagram', 'facebook', 'whatsapp', 'referral', 'website', 'other'] as const

export type CampaignRow = {
  id: string
  name: string
  code: string
  source: string
  is_active: boolean
  leads: number
  trials: number
  converted: number
}

export function CampaignsClient({ rows, locale, shareOrigin }: { rows: CampaignRow[]; locale: string; shareOrigin?: string }) {
  const t = useTranslations('campaigns')
  const isRTL = locale === 'ar'
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [source, setSource] = useState<string>('instagram')
  const [busy, setBusy] = useState(false)
  // INVITE-HOST: prefer the gym's canonical origin (server-resolved); fall back to
  // the current request host only if it wasn't supplied.
  const [runtimeOrigin, setRuntimeOrigin] = useState('')

  useEffect(() => { if (!shareOrigin) setRuntimeOrigin(window.location.origin) }, [shareOrigin])
  const origin = shareOrigin || runtimeOrigin

  const submit = async () => {
    setBusy(true)
    const res = await createCampaign({ name, source })
    setBusy(false)
    if (res.ok) { setOpen(false); setName(''); setSource('instagram'); router.refresh() }
  }

  const active = rows.filter((r) => r.is_active)
  const archived = rows.filter((r) => !r.is_active)

  const steps = [
    {
      key: 'name',
      title: t('stepName'),
      valid: name.trim() !== '',
      content: (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('nameLabel')}</label>
            <input data-testid="campaign-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('namePh')} className={cn('h-9 w-full rounded-lg border px-3 text-sm', isRTL && 'text-right')} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('sourceLabel')}</label>
            <ChipRow testid="campaign-source-chip"
              options={SOURCES.map((s) => ({ value: s, label: t(`source.${s}` as Parameters<typeof t>[0]) }))}
              value={source} onChange={(v) => setSource(v)} />
          </div>
        </div>
      ),
    },
    {
      key: 'review',
      title: t('stepReview'),
      content: (
        <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700" data-testid="campaign-review">
          <p className="font-semibold text-gray-900">{name}</p>
          <p>{t(`source.${source}` as Parameters<typeof t>[0])}</p>
          <p className="text-xs text-gray-400">{t('codeHint')}</p>
        </div>
      ),
    },
  ]

  return (
    <div className={cn('space-y-4', isRTL && 'text-right')}>
      <div className="flex items-center justify-between">
        <div>
          <PageHeader segment="campaigns" />
          <p className="mt-0.5 text-sm text-gray-500">{t('subtitle')}</p>
        </div>
        <button type="button" data-testid="campaign-add-btn" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-800">
          <Plus className="h-4 w-4" /> {t('add')}
        </button>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="campaigns-empty">
          <QrCode className="mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="campaigns-list">
          {active.map((c) => (
            <CampaignCard key={c.id} c={c} locale={locale} origin={origin} t={t} isRTL={isRTL}
              onArchive={async () => { await setCampaignActive(c.id, false); router.refresh() }} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2 opacity-70">
          <h2 className="text-sm font-semibold text-gray-400">{t('archived')}</h2>
          {archived.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border bg-white px-3 py-2" data-testid="campaign-archived-row" data-code={c.code}>
              <span className="text-sm text-gray-400 line-through">{c.name}</span>
              <button type="button" data-testid="campaign-restore" onClick={async () => { await setCampaignActive(c.id, true); router.refresh() }}
                className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded-full px-2 py-1">
                <ArchiveRestore className="h-3.5 w-3.5" /> {t('restore')}
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <FormWizard open onClose={() => setOpen(false)} title={t('addTitle')} steps={steps}
          onSubmit={submit} submitLabel={t('create')} busy={busy} locale={locale} testid="campaign-wizard" />
      )}
    </div>
  )
}

function CampaignCard({
  c, locale, origin, t, isRTL, onArchive,
}: {
  c: CampaignRow; locale: string; origin: string; t: ReturnType<typeof useTranslations>; isRTL: boolean; onArchive: () => void
}) {
  const link = origin ? `${origin}/${locale}?c=${c.code}` : `/${locale}?c=${c.code}`
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!origin) return
    QRCode.toDataURL(link, { width: 160, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [link, origin])

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" data-testid="campaign-card" data-code={c.code}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-wider text-gray-600">
            {t(`source.${c.source}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <button type="button" data-testid="campaign-archive" onClick={onArchive}
          className="rounded-full p-1.5 text-red-500 hover:bg-red-50" aria-label={t('archive')}>
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {qr
          ? <img data-testid="campaign-qr" src={qr} alt={t('qrAlt')} width={80} height={80} className="rounded-lg border" />
          : <div data-testid="campaign-qr-loading" className="h-20 w-20 animate-pulse rounded-lg bg-gray-100" />}
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-gray-400">{t('trackedLink')}</p>
          <code data-testid="campaign-link" className="block truncate rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-700" dir="ltr">{link}</code>
          <button type="button" data-testid="campaign-copy" onClick={copy}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      </div>

      {/* Per-campaign funnel: leads → trials → conversions */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center" data-testid="campaign-stats">
        <div><p className="text-lg font-bold text-gray-900" data-testid="campaign-leads">{c.leads}</p><p className="text-2xs text-gray-400">{t('statLeads')}</p></div>
        <div><p className="text-lg font-bold text-gray-900" data-testid="campaign-trials">{c.trials}</p><p className="text-2xs text-gray-400">{t('statTrials')}</p></div>
        <div><p className="text-lg font-bold text-green-600" data-testid="campaign-converted">{c.converted}</p><p className="text-2xs text-gray-400">{t('statConverted')}</p></div>
      </div>
    </div>
  )
}
