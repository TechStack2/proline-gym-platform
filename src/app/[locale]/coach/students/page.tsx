'use client';

import { dateLocale } from '@/lib/utils/locale-format'
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Users, Search, BookOpen, Award, Calendar, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface StudentEntry {
  id: string;
  first_name: string;
  last_name: string;
  discipline: string;
  belt_rank: string;
  last_attendance: string;
}

// ─── Localized message lookup ───
const t = (messages: any, path: string): string => {
  const keys = path.split('.');
  let val: any = messages;
  for (const k of keys) {
    val = val?.[k];
  }
  return typeof val === 'string' ? val : path;
};

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

export default function CoachStudentsPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const isRTL = locale === 'ar';
  const supabase = createClient();

  // COACH360-PORTAL: the hub's My Students rows drill here focused via ?q=.
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<any>(null);
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [filtered, setFiltered] = useState<StudentEntry[]>([]);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(true);
  const [disciplineFilter, setDisciplineFilter] = useState('');
  const [beltFilter, setBeltFilter] = useState('');
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [belts, setBelts] = useState<string[]>([]);

  // Load i18n messages
  useEffect(() => {
    import(`@/i18n/messages/${locale}.json`).then(m => setMessages(m.default));
  }, [locale]);

  const msg = useCallback((path: string) => (messages ? t(messages, path) : path), [messages]);

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

  const beltLabel = (rank: string): string => {
    if (!rank) return '';
    return rank.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  };

  if (!messages) {
    return <div className="p-4 text-gray-400 text-sm">{'Loading...'}</div>;
  }

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      {/* Header — COACH-SHELL: echoes the mobile chrome large title → desktop-only. */}
      <div>
        <h2 data-testid="coach-page-title" className={cn('hidden md:block text-lg font-bold text-gray-900', isRTL && 'font-arabic')}>
          {msg('coach.students.title')}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">{msg('coach.students.subtitle')}</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className={cn(
          'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400',
          isRTL ? 'right-3' : 'left-3'
        )} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={msg('coach.students.searchPlaceholder')}
          className={cn(
            'w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm text-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-primary-700/30 focus:border-primary-700',
            'placeholder:text-gray-400 appearance-none',
            isRTL ? 'pr-9 pl-4' : 'pl-9 pr-4'
          )}
        />
      </div>

      {/* Filters */}
      <div className={cn('flex gap-2', isRTL ? 'flex-row-reverse' : '')}>
        <select
          value={disciplineFilter}
          onChange={e => setDisciplineFilter(e.target.value)}
          className={cn(
            'flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-primary-700/30 focus:border-primary-700'
          )}
        >
          <option value="">{msg('coach.students.allDisciplines')}</option>
          {disciplines.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={beltFilter}
          onChange={e => setBeltFilter(e.target.value)}
          className={cn(
            'flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-primary-700/30 focus:border-primary-700'
          )}
        >
          <option value="">{msg('coach.students.allBelts')}</option>
          {belts.map(b => (
            <option key={b} value={b}>{beltLabel(b)}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <Users className="mx-auto h-10 w-10 mb-3 animate-pulse" />
          <p>{msg('common.loading')}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && students.length === 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <Users className="mx-auto h-10 w-10 mb-3" />
          <p className="font-medium">{msg('coach.students.noStudents')}</p>
          <p className="text-xs mt-1">{msg('coach.students.noStudentsHint')}</p>
        </div>
      )}

      {/* No Results After Filter */}
      {!loading && students.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <Search className="mx-auto h-10 w-10 mb-3" />
          <p>{msg('common.noResults')}</p>
        </div>
      )}

      {/* Student List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(student => (
            <Link
              key={student.id}
              href={`/${locale}/dashboard/students/${student.id}`}
              className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-primary-700/10 text-primary-700 inline-flex items-center justify-center text-sm font-bold flex-shrink-0">
                {student.first_name?.charAt(0) || '?'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold text-gray-900 truncate', isRTL && 'font-arabic')}>
                  {student.first_name} {student.last_name}
                </p>
                <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5', isRTL ? 'flex-row-reverse' : '')}>
                  {student.discipline && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <BookOpen className="h-3 w-3" />
                      {student.discipline}
                    </span>
                  )}
                  {student.belt_rank && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Award className="h-3 w-3" />
                      {beltLabel(student.belt_rank)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {student.last_attendance
                      ? new Date(student.last_attendance).toLocaleDateString(
                          dateLocale(locale),
                          { month: 'short', day: 'numeric' }
                        )
                      : msg('coach.students.never')}
                  </span>
                </div>
              </div>

              <ChevronRight className={cn('h-4 w-4 text-gray-300 flex-shrink-0', isRTL && 'rotate-180')} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
