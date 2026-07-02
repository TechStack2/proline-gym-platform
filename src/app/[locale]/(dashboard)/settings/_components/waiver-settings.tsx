'use client'

/**
 * F3 waiver TEMPLATE editor card (Settings → Configuration). Shows the current
 * template (title · v N · active) + an editor via the UX-2 FormWizard: title →
 * body (the consent text, ar/en/fr) → activate. Editing the BODY bumps the
 * version (server-side) so existing signatures become "outdated" and trigger a
 * re-sign — the card surfaces that with a note. Tenant-clean: this text is DATA.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormWizard } from '@/components/shared/form-wizard'
import { FileSignature, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveWaiverTemplate, type WaiverTemplate } from './waiver-actions'

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was remounting its subtree each render.
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>{children}</div>
)

export function WaiverSettings({ initial, locale }: { initial: WaiverTemplate; locale: string }) {
  const t = useTranslations('waiverSettings')
  const isRTL = locale === 'ar'
  const router = useRouter()

  const [tpl, setTpl] = useState<WaiverTemplate>(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [titleAr, setTitleAr] = useState(initial?.titleAr ?? '')
  const [titleEn, setTitleEn] = useState(initial?.titleEn ?? '')
  const [titleFr, setTitleFr] = useState(initial?.titleFr ?? '')
  const [bodyAr, setBodyAr] = useState(initial?.bodyAr ?? '')
  const [bodyEn, setBodyEn] = useState(initial?.bodyEn ?? '')
  const [bodyFr, setBodyFr] = useState(initial?.bodyFr ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)

  const bodyChanged = !!tpl && (bodyAr.trim() !== tpl.bodyAr || bodyEn.trim() !== tpl.bodyEn || bodyFr.trim() !== tpl.bodyFr)

  const submit = async () => {
    setBusy(true)
    const res = await saveWaiverTemplate({ titleAr, titleEn, titleFr, bodyAr, bodyEn, bodyFr, isActive })
    setBusy(false)
    if (res.ok) {
      setTpl({ id: tpl?.id ?? 'new', version: res.version, isActive,
        titleAr: titleAr.trim(), titleEn: titleEn.trim(), titleFr: titleFr.trim(),
        bodyAr: bodyAr.trim(), bodyEn: bodyEn.trim(), bodyFr: bodyFr.trim() })
      setOpen(false)
      router.refresh()
    }
  }

  const steps = [
    {
      key: 'title', title: t('stepTitle'), valid: titleEn.trim().length > 0,
      content: (
        <div className="space-y-3">
          <F label={t('titleAr')}><Input data-testid="wv-title-ar" dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} /></F>
          <F label={t('titleEn')}><Input data-testid="wv-title-en" dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></F>
          <F label={t('titleFr')}><Input data-testid="wv-title-fr" dir="ltr" value={titleFr} onChange={(e) => setTitleFr(e.target.value)} /></F>
        </div>
      ),
    },
    {
      key: 'body', title: t('stepBody'), valid: bodyEn.trim().length > 0,
      content: (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{t('bodyHint')}</p>
          <F label={t('bodyAr')}><Textarea data-testid="wv-body-ar" dir="rtl" rows={3} value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} /></F>
          <F label={t('bodyEn')}><Textarea data-testid="wv-body-en" dir="ltr" rows={3} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} /></F>
          <F label={t('bodyFr')}><Textarea data-testid="wv-body-fr" dir="ltr" rows={3} value={bodyFr} onChange={(e) => setBodyFr(e.target.value)} /></F>
        </div>
      ),
    },
    {
      key: 'activate', title: t('stepActivate'),
      content: (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" data-testid="wv-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[#cd1419]" />
            {t('activeLabel')}
          </label>
          {bodyChanged && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700" data-testid="wv-bump-note">{t('bumpNote')}</p>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className={cn('rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3', isRTL && 'rtl text-right')} data-testid="waiver-settings">
      <div className="flex items-center justify-between">
        <h3 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <FileSignature className="h-4 w-4 text-[#cd1419]" /> {t('title')}
        </h3>
        {tpl && (
          <span data-testid="waiver-template-version"
            className={cn('rounded-full px-2.5 py-1 text-xs font-medium', tpl.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
            {t('versionBadge', { v: tpl.version })}{tpl.isActive ? '' : ` · ${t('inactive')}`}
          </span>
        )}
      </div>

      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">{t('explainer')}</p>

      {tpl && (
        <p data-testid="waiver-template-title" className="text-sm font-medium text-gray-800">
          {(locale === 'ar' ? tpl.titleAr : locale === 'fr' ? tpl.titleFr : tpl.titleEn) || tpl.titleEn}
        </p>
      )}

      <Button size="sm" data-testid="wv-edit-open" onClick={() => setOpen(true)} className="gap-1 bg-[#cd1419] hover:bg-[#a81014]">
        <Pencil className="h-4 w-4" /> {tpl ? t('edit') : t('create')}
      </Button>

      <FormWizard
        open={open} onClose={() => setOpen(false)} title={t('editorTitle')}
        steps={steps} onSubmit={submit} submitLabel={t('save')} busy={busy} locale={locale} testid="waiver-editor"
      />
    </div>
  )
}
