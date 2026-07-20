import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Users, ChevronRight, Search } from 'lucide-react'
import { localizedName, one } from '@/lib/names'
import { matchingProfileIds } from '@/lib/admin/profile-search'
import { getFamilySummaries, familyOutstandingTotal } from '@/lib/family/aggregate'
import { Avatar } from '@/components/shared/avatar'
import { MembersTabs } from '../components/members-tabs'
import { PageHeader } from '@/components/ui/page-header';
import { fmtPhone } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'
import { StatusChip } from '@/components/ui/status-chip'

/**
 * GUARDIAN-360 R1 — the staff Guardians list. Field finding 12: guardians were
 * invisible to staff ("Sam has 3 children" meant opening each child separately).
 * This is a read-only VIEW over the existing guardians/guardian_students model —
 * one row per guardian with their dependents count + combined family balance,
 * searchable by name/phone. Reads ride the staff FOR ALL policies; no new model.
 */
export const dynamic = 'force-dynamic'

export default async function GuardiansPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { q?: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('guardians')
  const isRTL = locale === 'ar'

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null

  const q = (searchParams.q ?? '').trim()
  let gq = supabase
    .from('guardians')
    .select('id, profile_id, relationship_ar, relationship_en, relationship_fr, is_primary_contact, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, avatar_url)')
    .eq('gym_id', gymId)
    .is('deleted_at', null)
  if (q) {
    const ids = await matchingProfileIds(supabase, gymId, q)
    gq = gq.in('profile_id', ids)
  }
  const { data: guardians } = await gq

  // Links → dependents per guardian; one batched family aggregation for the totals.
  const guardianIds = (guardians ?? []).map((g: any) => g.id)
  const { data: links } = guardianIds.length
    ? await supabase.from('guardian_students').select('guardian_id, student_id').in('guardian_id', guardianIds)
    : { data: [] as any[] }
  const kidIdsByGuardian = new Map<string, string[]>()
  for (const l of (links ?? []) as any[]) {
    const arr = kidIdsByGuardian.get(l.guardian_id) ?? []
    arr.push(l.student_id)
    kidIdsByGuardian.set(l.guardian_id, arr)
  }
  const allKidIds = [...new Set((links ?? []).map((l: any) => l.student_id))]
  const summaries = await getFamilySummaries(supabase, allKidIds, locale)

  const rel = (g: any) => (isRTL ? g.relationship_ar : locale === 'fr' ? g.relationship_fr : g.relationship_en) || ''
  const rows = (guardians ?? []).map((g: any) => {
    const kidIds = kidIdsByGuardian.get(g.id) ?? []
    const kidSummaries = kidIds.map((id) => summaries.get(id)).filter(Boolean) as any[]
    return {
      id: g.id,
      name: localizedName(one(g.profiles), locale),
      phone: one(g.profiles)?.phone ?? null,
      avatarUrl: one(g.profiles)?.avatar_url ?? null,
      relationship: rel(g),
      dependents: kidIds.length,
      outstanding: familyOutstandingTotal(kidSummaries),
    }
  })
  // Guardians with the most dependents / the most owed first — the ones staff act on.
  rows.sort((a, b) => b.outstanding - a.outstanding || b.dependents - a.dependents || a.name.localeCompare(b.name))

  return (
    <div className="space-y-6" data-testid="guardians-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader segment="students" />
        <MembersTabs active="guardians" locale={locale} />
      </div>

      <form className="relative max-w-md" action={`/${locale}/students/guardians`}>
        <Search className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-gray-400 ltr:left-3 rtl:right-3" aria-hidden />
        <input
          type="search" name="q" defaultValue={q} data-testid="guardian-search"
          placeholder={t('searchPlaceholder')}
          className={cn('w-full rounded-xl border border-gray-200 bg-white py-2 text-sm outline-none focus:border-primary-400 ltr:pl-9 ltr:pr-3 rtl:pr-9 rtl:pl-3', isRTL && 'text-right font-arabic')}
        />
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center" data-testid="guardians-empty">
          <Users className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden />
          <p className={cn('text-sm text-gray-500', isRTL && 'font-arabic')}>{q ? t('noMatch') : t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/${locale}/students/guardians/${r.id}`} data-testid="guardian-list-row" data-guardian-id={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-primary-200">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar url={r.avatarUrl} name={r.name} />
                  <span className="min-w-0">
                    <span className={cn('block truncate font-semibold text-gray-900', isRTL && 'font-arabic')}>{r.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                      {r.phone && <Ltr>{fmtPhone(r.phone)}</Ltr>}
                      {r.relationship && <span>· {r.relationship}</span>}
                      <span data-testid="guardian-row-dependents">· {t('dependents', { count: r.dependents })}</span>
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {/* DA-32: "Settled" was bare green text beside a chevron, so it read
                      as a link rather than a status. §2.3: statuses are chips — one
                      vocabulary, one shape. The owing amount keeps its own emphasis
                      (it is a value, not a status) and gets DA-7 isolation. */}
                  {r.outstanding > 0.005 ? (
                    <span data-testid="guardian-row-outstanding" data-amount={r.outstanding.toFixed(2)}
                      className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                      <Ltr>${r.outstanding.toFixed(2)}</Ltr>
                    </span>
                  ) : (
                    <StatusChip domain="member" status="active" label={t('settled')} size="sm"
                      data-testid="guardian-row-outstanding" data-amount="0.00" />
                  )}
                  <ChevronRight className={cn('h-4 w-4 text-gray-300', isRTL && 'rotate-180')} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
