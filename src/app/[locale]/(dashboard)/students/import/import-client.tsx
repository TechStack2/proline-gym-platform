'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Download, Upload, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, UserPlus, Users, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  IMPORT_COLUMNS, EXAMPLE_ROW, rowFromCells, buildImportPlan, importableRows,
  hasBlockingErrors, summarizePlan, type PlannedRow, type RawRow,
} from '@/lib/members/import'
import { getImportContext, importMembers, type ImportSummary } from './actions'

type Props = { locale: string }

const DISPOSITION_TONE: Record<string, string> = {
  create: 'bg-green-50 text-green-700 border-green-200',
  create_link_guardian: 'bg-blue-50 text-blue-700 border-blue-200',
  duplicate_skip: 'bg-gray-100 text-gray-500 border-gray-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  example: 'bg-amber-50 text-amber-600 border-amber-200',
}

export function ImportClient({ locale }: Props) {
  const t = useTranslations('students.import')
  const router = useRouter()
  const isRTL = locale === 'ar'
  const inputRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<'template' | 'parse' | 'import' | null>(null)
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState<PlannedRow[] | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  // ── R1: download the .xlsx template (localized headers + one example row) ──
  const downloadTemplate = async () => {
    setBusy('template')
    try {
      const writeXlsxFile = (await import('write-excel-file/browser')).default
      const header = IMPORT_COLUMNS.map((col) => ({ value: t(`columns.${col}` as never), fontWeight: 'bold' as const }))
      const example = IMPORT_COLUMNS.map((col) => ({ value: EXAMPLE_ROW[col], type: String }))
      // The browser build returns a { toFile, toBlob } handle; toFile triggers the download.
      await writeXlsxFile([header, example], {
        rightToLeft: isRTL,
        columns: IMPORT_COLUMNS.map(() => ({ width: 20 })),
      }).toFile('member-import-template.xlsx')
    } catch {
      toast.error(t('errors.template_failed'))
    } finally {
      setBusy(null)
    }
  }

  // ── R2: upload → parse client-side → validate → preview ──
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('parse'); setSummary(null); setPlan(null); setExcluded(new Set())
    try {
      const readXlsxFile = (await import('read-excel-file/browser')).default
      const sheet = await readXlsxFile(file)
      // Row 0 is the (localized) header — mapping is BY POSITION, so header text is ignored.
      const rawRows: RawRow[] = sheet.slice(1).map((cells) => rowFromCells(cells as unknown as unknown[]))
      const ctx = await getImportContext()
      const existing = new Set(ctx.ok ? ctx.existingPhones : [])
      const built = buildImportPlan(rawRows, existing)
      setPlan(built)
      setFileName(file.name)
      if (built.length === 0) toast.error(t('errors.empty_file'))
    } catch {
      toast.error(t('errors.parse_failed'))
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = '' // allow re-selecting the same file
    }
  }

  const toggleExclude = (index: number) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })

  const runImport = async () => {
    if (!plan) return
    const toWrite = importableRows(plan, excluded).map((r) => r.raw)
    if (toWrite.length === 0) { toast.error(t('errors.nothing_to_import')); return }
    setBusy('import')
    try {
      const res = await importMembers(toWrite)
      if (!res.ok) { toast.error(t(`errors.${res.error}` as never)); return }
      setSummary(res.summary)
      toast.success(t('toast.imported', { n: res.summary.created }))
      router.refresh()
    } catch {
      toast.error(t('errors.import_failed'))
    } finally {
      setBusy(null)
    }
  }

  const s = plan ? summarizePlan(plan) : null
  const blocked = plan ? hasBlockingErrors(plan, excluded) : false
  const writeCount = plan ? importableRows(plan, excluded).length : 0

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'} data-testid="import-page">
      <div>
        <Link href={`/${locale}/students`} data-testid="import-back" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} /> {t('back')}
        </Link>
        <h1 className={cn('mt-2 text-2xl font-bold text-gray-900', isRTL && 'font-arabic text-right')}>{t('title')}</h1>
        <p className={cn('mt-1 text-sm text-gray-500', isRTL && 'font-arabic text-right')}>{t('subtitle')}</p>
      </div>

      {/* ── Step 1: template + format docs ── */}
      <div className="rounded-2xl border bg-white p-5">
        <h2 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('step1_title')}</h2>
        <p className={cn('mt-1 text-xs text-gray-500', isRTL && 'font-arabic')}>{t('step1_help')}</p>
        <Button variant="outline" size="sm" className="mt-3 rounded-lg" data-testid="import-download-template" onClick={downloadTemplate} disabled={busy === 'template'}>
          {busy === 'template' ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Download className="me-2 h-4 w-4" />}
          {t('download_template')}
        </Button>
        {/* On-screen format documentation (R1) */}
        <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2" data-testid="import-format-docs">
          {IMPORT_COLUMNS.map((col) => (
            <li key={col} className={cn('text-xs text-gray-600', isRTL && 'font-arabic text-right')}>
              <span className="font-medium text-gray-900">{t(`columns.${col}` as never)}</span> — {t(`colhelp.${col}` as never)}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Step 2: upload ── */}
      <div className="rounded-2xl border bg-white p-5">
        <h2 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('step2_title')}</h2>
        <p className={cn('mt-1 text-xs text-gray-500', isRTL && 'font-arabic')}>{t('step2_help')}</p>
        <label className="mt-3 inline-block">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" data-testid="import-file-input" onChange={onPickFile} />
          <span className={cn('inline-flex cursor-pointer items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300', busy === 'parse' && 'opacity-60')}>
            {busy === 'parse' ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
            {fileName || t('choose_file')}
          </span>
        </label>
      </div>

      {/* ── Step 3: preview + import ── */}
      {plan && s && (
        <div className="rounded-2xl border bg-white p-5" data-testid="import-preview">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Stat tone="green" icon={<UserPlus className="h-3.5 w-3.5" />} label={t('summary.create')} n={s.create} testid="sum-create" />
              <Stat tone="blue" icon={<Users className="h-3.5 w-3.5" />} label={t('summary.linkGuardian')} n={s.linkGuardian} testid="sum-link" />
              <Stat tone="gray" icon={<SkipForward className="h-3.5 w-3.5" />} label={t('summary.skip')} n={s.skip} testid="sum-skip" />
              <Stat tone="red" icon={<AlertTriangle className="h-3.5 w-3.5" />} label={t('summary.error')} n={s.error} testid="sum-error" />
            </div>
            <Button size="sm" className="rounded-lg" data-testid="import-run" onClick={runImport} disabled={busy === 'import' || blocked || writeCount === 0}>
              {busy === 'import' ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
              {t('import_n', { n: writeCount })}
            </Button>
          </div>
          {blocked && (
            <p data-testid="import-blocked" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{t('blocked_by_errors')}</p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-start text-xs text-gray-500">
                  <th className="py-2 pe-2"></th>
                  <th className="py-2 pe-2 text-start">{t('col_name')}</th>
                  <th className="py-2 pe-2 text-start">{t('col_phone')}</th>
                  <th className="py-2 pe-2 text-start">{t('col_disposition')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((r) => {
                  const isExcluded = excluded.has(r.index)
                  const name = [r.raw.first_name_en || r.raw.first_name_ar, r.raw.last_name_en || r.raw.last_name_ar].filter(Boolean).join(' ')
                  return (
                    <tr key={r.index} data-testid={`import-row-${r.index}`} data-disposition={r.disposition} className={cn('border-b', isExcluded && 'opacity-40')}>
                      <td className="py-2 pe-2">
                        <input type="checkbox" data-testid={`import-exclude-${r.index}`} checked={!isExcluded} onChange={() => toggleExclude(r.index)} className="h-3.5 w-3.5 rounded border-gray-300" title={t('include')} />
                      </td>
                      <td className={cn('py-2 pe-2', isRTL && 'font-arabic')}>{name || <span className="text-gray-400">—</span>}</td>
                      <td dir="ltr" className="py-2 pe-2 tabular-nums text-gray-600">{r.normalizedPhone || r.raw.phone || '—'}</td>
                      <td className="py-2 pe-2">
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', DISPOSITION_TONE[r.disposition])}>
                          {t(`disposition.${r.disposition}` as never)}
                        </span>
                        {r.reasons.length > 0 && (
                          <span className={cn('ms-2 text-xs text-gray-400', isRTL && 'font-arabic')}>{r.reasons.map((x) => t(`reason.${x}` as never)).join(' · ')}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Import result ── */}
      {summary && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5" data-testid="import-result">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className={cn('text-sm font-semibold', isRTL && 'font-arabic')}>{t('done_title')}</h2>
          </div>
          <p className={cn('mt-1 text-sm text-green-700', isRTL && 'font-arabic')} data-testid="import-result-summary">
            {t('done_summary', { created: summary.created, linked: summary.guardiansLinked, skipped: summary.skipped, failed: summary.failed })}
          </p>
          <Link href={`/${locale}/students?chip=lapsed`} className="mt-3 inline-block">
            <Button size="sm" variant="outline" className="rounded-lg" data-testid="import-view-members">{t('view_lapsed')}</Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, n, tone, testid }: { icon: React.ReactNode; label: string; n: number; tone: string; testid: string }) {
  const tones: Record<string, string> = {
    green: 'bg-green-50 text-green-700', blue: 'bg-blue-50 text-blue-700', gray: 'bg-gray-100 text-gray-600', red: 'bg-red-50 text-red-700',
  }
  return (
    <span data-testid={testid} data-count={n} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium', tones[tone])}>
      {icon} {label} · {n}
    </span>
  )
}
