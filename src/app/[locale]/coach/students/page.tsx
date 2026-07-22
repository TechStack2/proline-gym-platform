'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { createClient } from '@/lib/supabase/client';
import { fmtDate } from '@/lib/fmt';
import { Ltr } from '@/components/ui/bdi';
import { beltRankLabel, beltSwatchClass } from '@/lib/belts/label';
import { Users, Search, BookOpen, Award, Calendar } from 'lucide-react';
import { DeskGrid } from '@/components/portal/portal-kit';

interface StudentEntry {
  id: string;
  first_name: string;
  last_name: string;
  discipline: string;
  belt_rank: string;
  last_attendance: string;
}

// Type-safe localized field accessor
function getLocalized(obj: any, locale: string, fieldBase: string): string {
  if (!obj) return '';
  const key = `${fieldBase}_${locale}`;
  const val = obj[key];
  if (typeof val === 'string' && val.trim()) return val;
  const enKey = `${fieldBase}_en`;
  const enVal = obj[enKey];
  if (typeof enVal === 'string' && enVal.trim()) return enVal;
  return '';
}

/** §2.6 filter chip — apply on tap, tap again to clear. */
function FilterChip({
  active, onClick, children, testid,
}: { active: boolean; onClick: () => void; children: React.ReactNode; testid?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
        active
          ? 'border-primary-700 bg-primary-700 text-primary-foreground'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
      )}
    >
      {children}
    </button>
  );
}

export default function CoachStudentsPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const supabase = createClient();
  // W3a §2.7: through next-intl like every other page — the old hand-rolled
  // messages-import + path-walker silently returned the key path on a miss,
  // which is exactly the DA-5 class the missing-key gate exists to catch.
  const t = useTranslations('coach.students');
  const tCommon = useTranslations('common');
  const tb = useTranslations('beltRanks');

  // COACH360-PORTAL: the hub's My Students rows drill here focused via ?q=.
  const searchParams = useSearchParams();
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [filtered, setFiltered] = useState<StudentEntry[]>([]);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(true);
  const [disciplineFilter, setDisciplineFilter] = useState('');
  const [beltFilter, setBeltFilter] = useState('');
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [belts, setBelts] = useState<string[]>([]);

  // Fetch students
  useEffect(() => {
    async function loadStudents() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: coach } = await supabase
          .from('coaches')
          .select('id')
          .eq('profile_id', user.id)
          .single();

        if (!coach) return;

        // Get classes taught by this coach
        const { data: classes } = await supabase
          .from('classes')
          .select('id')
          .eq('coach_id', coach.id)
          .eq('is_active', true);

        const classIds = (classes || []).map((c: any) => c.id);
        if (classIds.length === 0) {
          setStudents([]);
          setFiltered([]);
          setLoading(false);
          return;
        }

        // Get enrollments with student details
        const { data: enrollments } = await supabase
          .from('class_enrollments')
          .select(`
            student_id,
            class_id,
            classes!inner (
              disciplines!inner (
                name_ar, name_en, name_fr
              )
            ),
            students!inner (
              id,
              profiles!inner (
                first_name_ar, first_name_en, first_name_fr,
                last_name_ar, last_name_en, last_name_fr
              )
            )
          `)
          .in('class_id', classIds)
          .eq('is_active', true);

        // Get belt info
        const studentIds = [...new Set((enrollments || []).map((e: any) => e.student_id))];
        const { data: beltDataRaw } = await supabase
          .from('belt_promotions')
          .select('student_id, belt_rank, discipline_id, disciplines!inner(name_ar, name_en, name_fr)')
          .in('student_id', studentIds.length > 0 ? studentIds : ['none'])
          .order('promotion_date', { ascending: false });

        // Get latest belt per student
        const beltMap: Record<string, { rank: string; discipline: string }> = {};
        for (const b of (beltDataRaw || [])) {
          if (!beltMap[b.student_id]) {
            const disc: any = b.disciplines && (Array.isArray(b.disciplines) ? b.disciplines[0] : b.disciplines);
            beltMap[b.student_id] = {
              rank: b.belt_rank || '',
              discipline: getLocalized(disc, locale, 'name'),
            };
          }
        }

        // Get last attendance per student
        const { data: attendanceData } = await supabase
          .from('attendance_records')
          .select('student_id, attendance_date')
          .in('student_id', studentIds.length > 0 ? studentIds : ['none'])
          .order('attendance_date', { ascending: false });

        const lastAttendanceMap: Record<string, string> = {};
        for (const a of (attendanceData || [])) {
          if (!lastAttendanceMap[a.student_id]) {
            lastAttendanceMap[a.student_id] = a.attendance_date;
          }
        }

        // Deduplicate by student_id and build entries
        const seen = new Set<string>();
        const entries: StudentEntry[] = [];
        const discSet = new Set<string>();
        const beltSet = new Set<string>();

        for (const e of (enrollments || [])) {
          if (seen.has(e.student_id)) continue;
          seen.add(e.student_id);

          const student: any = e.students && (Array.isArray(e.students) ? e.students[0] : e.students);
          const profile: any = student?.profiles && (Array.isArray(student.profiles) ? student.profiles[0] : student.profiles);
          const cls: any = e.classes && (Array.isArray(e.classes) ? e.classes[0] : e.classes);
          const disc: any = cls?.disciplines && (Array.isArray(cls.disciplines) ? cls.disciplines[0] : cls.disciplines);

          const discName = getLocalized(disc, locale, 'name');
          const beltInfo = beltMap[e.student_id];

          entries.push({
            id: e.student_id,
            first_name: getLocalized(profile, locale, 'first_name'),
            last_name: getLocalized(profile, locale, 'last_name'),
            discipline: beltInfo?.discipline || discName || '',
            belt_rank: beltInfo?.rank || '',
            last_attendance: lastAttendanceMap[e.student_id] || '',
          });

          if (discName) discSet.add(discName);
          if (beltInfo?.rank) beltSet.add(beltInfo.rank);
        }

        setStudents(entries);
        setFiltered(entries);
        setDisciplines([...discSet].sort());
        setBelts([...beltSet].sort());
      } catch (err) {
        console.error('Failed to load students:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // Search + filter
  useEffect(() => {
    let result = [...students];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        s =>
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q) ||
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
      );
    }

    if (disciplineFilter) {
      result = result.filter(s => s.discipline === disciplineFilter);
    }

    if (beltFilter) {
      result = result.filter(s => s.belt_rank === beltFilter);
    }

    setFiltered(result);
  }, [search, disciplineFilter, beltFilter, students]);

  // DA-9: localize belt ranks via enumLabel's beltRankLabel (no raw enum /
  // English belt names in the Arabic UI).
  const beltLabel = (rank: string): string =>
    rank ? beltRankLabel(rank, (k) => tb(k as never), '') : '';

  return (
    /* W3a R3: the undefined `rtl` class swept (DA-61). */
    <div className="p-4 space-y-4">
      {/* W2b R3: the ONE title primitive (testid `page-title`, h1 — was an h2
          with `coach-page-title`); mobile keeps the always-visible subtitle. */}
      <div>
        <PageHeader title={t('title')} subtitle={t('subtitle')} variant="compact" />
        <p className="text-sm text-gray-500 md:hidden">{t('subtitle')}</p>
      </div>

      {/* W2a §4.2 Rule 1 (asideFirst): search + filters are the coach's controls —
          above the list on mobile, the aside column on desktop; main = states + list. */}
      <DeskGrid asideFirst gap="space-y-4" aside={<>
      {/* Search Bar — §4.1: logical-side positioning only (was isRTL ? right : left). */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className={cn(
            'w-full rounded-xl border border-gray-200 bg-white py-2.5 ps-9 pe-4 text-sm text-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-primary-700/30 focus:border-primary-700',
            'placeholder:text-gray-400 appearance-none'
          )}
        />
      </div>

      {/* §2.6 (DA-33): the two native <select>s become chip filters — small
          option sets apply on tap, clear on re-tap; no white OS control in dark,
          no LTR dropdown inside RTL pages. */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" data-testid="coach-students-discipline-filter">
          <FilterChip active={!disciplineFilter} onClick={() => setDisciplineFilter('')}>
            {t('allDisciplines')}
          </FilterChip>
          {disciplines.map(d => (
            <FilterChip key={d} testid="coach-students-discipline-chip" active={disciplineFilter === d}
              onClick={() => setDisciplineFilter(cur => (cur === d ? '' : d))}>
              <BookOpen className="h-3 w-3" aria-hidden />{d}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="coach-students-belt-filter">
          <FilterChip active={!beltFilter} onClick={() => setBeltFilter('')}>
            {t('allBelts')}
          </FilterChip>
          {belts.map(b => (
            <FilterChip key={b} testid="coach-students-belt-chip" active={beltFilter === b}
              onClick={() => setBeltFilter(cur => (cur === b ? '' : b))}>
              <span className={cn('h-2 w-2 rounded-full', beltSwatchClass(b))} aria-hidden />
              {beltLabel(b)}
            </FilterChip>
          ))}
        </div>
      </div>
      </>} main={<>
      {/* Loading */}
      {loading && (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <Users className="mx-auto h-10 w-10 mb-3 animate-pulse" />
          <p>{tCommon('loading')}</p>
        </div>
      )}

      {/* Empty State — §2.4: the calm primitive. */}
      {!loading && filtered.length === 0 && students.length === 0 && (
        <EmptyState icon={Users} title={t('noStudents')} hint={t('noStudentsHint')} data-testid="coach-students-empty" />
      )}

      {/* No Results After Filter */}
      {!loading && students.length > 0 && filtered.length === 0 && (
        <EmptyState icon={Search} title={tCommon('noResults')} />
      )}

      {/* Student List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {/* W3b R5 (decree: SHELLS NEVER CROSS-LINK): the row linked a coach into
              /dashboard/students/:id — a STAFF surface (and a dead path at that:
              the (dashboard) group adds no /dashboard segment). The roster row
              already shows everything the coach-readable dataset carries
              (name · discipline · belt · last seen), so an in-shell detail sheet
              would duplicate the row; the link is removed rather than faked.
              A real coach student-detail surface (attendance history, contact)
              needs its own RLS review — hoppered as COACH-STUDENT-360. */}
          {filtered.map(student => (
            <div
              key={student.id}
              data-testid="coach-roster-row"
              className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm border border-gray-100"
            >
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-primary-700/10 text-primary-700 inline-flex items-center justify-center text-sm font-bold flex-shrink-0">
                {student.first_name?.charAt(0) || '?'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {student.first_name} {student.last_name}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  {student.discipline && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <BookOpen className="h-3 w-3" />
                      {student.discipline}
                    </span>
                  )}
                  {student.belt_rank && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      {/* DA-43: the rank wears its belt colour here too. */}
                      <Award className="h-3 w-3" />
                      <span className={cn('h-2 w-2 rounded-full', beltSwatchClass(student.belt_rank))} aria-hidden />
                      {beltLabel(student.belt_rank)}
                    </span>
                  )}
                  {/* DA-54: "Never" gets its label — the last-seen date is
                      named, not a bare floating date; via fmt (DA-34). */}
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {t('lastSeen')}:{' '}
                    {student.last_attendance
                      ? <Ltr>{fmtDate(student.last_attendance, locale, 'dayMonth')}</Ltr>
                      : t('never')}
                  </span>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}
      </>} />
    </div>
  );
}
