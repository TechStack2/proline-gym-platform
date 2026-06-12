'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { attendanceRecordSchema } from '@/lib/validators';
import { saveAttendance } from './actions';
import { computeEligibility } from '@/lib/eligibility';
import {
  Calendar,
  ClipboardCheck,
  Users,
  Check,
  X,
  Clock,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface StudentEntry {
  student_id: string;
  class_id: string;
  first_name: string;
  last_name: string;
  discipline: string;
  status: AttendanceStatus;
  eligible?: boolean;
  eligibilityLabel?: string;
}

interface ClassOption {
  id: string;
  start_time: string;
  end_time: string;
  name: string;
  discipline: string;
  room: string;
  student_count: number;
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

export default function CoachAttendancePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const isRTL = locale === 'ar';
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get('classId');
  const supabase = createClient();

  const [messages, setMessages] = useState<any>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId || '');
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // REP-1: a coach can mark/correct attendance for a PAST date (today or up to 7
  // days back, never the future). The date drives which weekday's classes show,
  // which day's existing records prefill, and the date written by saveAttendance —
  // it reuses the SAME upsert write path, no new writes.
  const todayStr = new Date().toISOString().split('T')[0];
  const minDateStr = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Load i18n messages
  useEffect(() => {
    import(`@/i18n/messages/${locale}.json`).then(m => setMessages(m.default));
  }, [locale]);

  const msg = useCallback((path: string) => (messages ? t(messages, path) : path), [messages]);

  // Fetch today's classes for this coach
  useEffect(() => {
    async function loadClasses() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (!coach) return;

      // Weekday is derived from the SELECTED date (recurring schedule model).
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();

      const { data: raw } = await supabase
        .from('class_schedules')
        .select(`
          id,
          start_time,
          end_time,
          classes!inner (
            id, room, name_ar, name_en, name_fr,
            disciplines!inner ( name_ar, name_en, name_fr )
          )
        `)
        .eq('day_of_week', dayOfWeek)
        .eq('classes.coach_id', coach.id)
        .eq('classes.is_active', true)
        .eq('is_active', true)
        .order('start_time', { ascending: true });

      // Get enrollment counts
      const scheduleList: any[] = (raw || []).map((s: any) => ({
        ...s,
        classes: Array.isArray(s.classes) ? s.classes[0] : s.classes,
      }));

      const classIds = scheduleList.map((s: any) => s.classes?.id).filter(Boolean) as string[];
      const countMap: Record<string, number> = {};

      if (classIds.length > 0) {
        const { data: enrolls } = await supabase
          .from('class_enrollments')
          .select('class_id')
          .in('class_id', classIds)
          .eq('is_active', true);
        for (const e of (enrolls || [])) {
          countMap[e.class_id] = (countMap[e.class_id] || 0) + 1;
        }
      }

      const options: ClassOption[] = scheduleList.map((s: any) => {
        const cls = s.classes;
        const disc = cls?.disciplines && (Array.isArray(cls.disciplines) ? cls.disciplines[0] : cls.disciplines);
        return {
          id: cls?.id || '',
          start_time: s.start_time?.substring(0, 5) || '',
          end_time: s.end_time?.substring(0, 5) || '',
          name: cls?.[`name_${locale}`] || cls?.name_en || '',
          discipline: disc?.[`name_${locale}`] || disc?.name_en || '',
          room: cls?.room || '',
          student_count: countMap[cls?.id] || 0,
        };
      });

      setClasses(options);

      // Keep a still-valid selection across date changes; otherwise fall back to
      // the initialClassId (deep link) or clear it (the class isn't on this day).
      setSelectedClassId(prev => {
        if (prev && options.some(o => o.id === prev)) return prev;
        if (initialClassId && options.some(o => o.id === initialClassId)) return initialClassId;
        return '';
      });
      setLoaded(true);
    }

    loadClasses();
  }, [locale, initialClassId, selectedDate]);

  // Fetch students when class is selected
  useEffect(() => {
    if (!selectedClassId || !loaded) return;

    async function loadStudents() {
      setLoading(true);
      setStudents([]);

      // Existing records prefill for the SELECTED date (correction-aware).
      const recordDate = selectedDate;

      // Get enrolled students (+ belt fields for the eligibility hint, T3)
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select(`
          student_id,
          students!inner (
            id, current_belt_rank, belt_promotion_date,
            profiles!inner (
              first_name_ar, first_name_en, first_name_fr,
              last_name_ar, last_name_en, last_name_fr
            )
          )
        `)
        .eq('class_id', selectedClassId)
        .eq('is_active', true);

      // The class's discipline drives eligibility (per-discipline rank).
      const { data: cls } = await supabase
        .from('classes')
        .select('discipline_id')
        .eq('id', selectedClassId)
        .single();
      const disciplineId = cls?.discipline_id ?? null;

      // Get existing attendance records for today
      const { data: existingRecords } = await supabase
        .from('attendance_records')
        .select('student_id, status')
        .eq('class_id', selectedClassId)
        .eq('attendance_date', recordDate);

      const statusMap: Record<string, AttendanceStatus> = {};
      for (const r of (existingRecords || [])) {
        statusMap[r.student_id] = r.status as AttendanceStatus;
      }

      const studentEntries: StudentEntry[] = await Promise.all(
        (enrollments || []).map(async (e: any) => {
          const student = e.students && (Array.isArray(e.students) ? e.students[0] : e.students);
          const profile = student?.profiles && (Array.isArray(student.profiles) ? student.profiles[0] : student.profiles);

          let eligible: boolean | undefined;
          let eligibilityLabel: string | undefined;
          if (disciplineId && student?.id) {
            try {
              const el = await computeEligibility(supabase, {
                studentId: student.id,
                disciplineId,
                currentRank: student.current_belt_rank ?? null,
                beltPromotionDate: student.belt_promotion_date ?? null,
              });
              eligible = el.hasNext ? el.eligible : undefined;
              eligibilityLabel = el.hasNext ? `${el.attended} / ${el.requiredClasses ?? '—'}` : undefined;
            } catch {
              // eligibility is a read-only hint; never block attendance on it
            }
          }

          return {
            student_id: e.student_id,
            class_id: selectedClassId,
            first_name: profile?.[`first_name_${locale}`] || profile?.first_name_en || '',
            last_name: profile?.[`last_name_${locale}`] || profile?.last_name_en || '',
            discipline: '',
            status: statusMap[e.student_id] || 'present',
            eligible,
            eligibilityLabel,
          };
        }),
      );

      setStudents(studentEntries);
      setLoading(false);
    }

    loadStudents();
  }, [selectedClassId, loaded, locale, selectedDate]);

  const toggleStatus = (studentId: string, status: AttendanceStatus) => {
    setStudents(prev =>
      prev.map(s => (s.student_id === studentId ? { ...s, status } : s))
    );
  };

  const markAllPresent = () => {
    setStudents(prev => prev.map(s => ({ ...s, status: 'present' as AttendanceStatus })));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const markDate = selectedDate;
      const { data: { user } } = await supabase.auth.getUser();
      const markedBy = user?.id;

      // Validate each attendance record before upsert
      const validationResults = students.map(s =>
        attendanceRecordSchema.safeParse({
          class_schedule_id: s.class_id,
          student_id: s.student_id,
          status: s.status,
          date: markDate,
        })
      );

      const firstError = validationResults.find(r => !r.success);
      if (firstError && !firstError.success) {
        const firstIssue = firstError.error?.issues?.[0];
        toast.error(firstIssue?.message || 'Validation error');
        setSaving(false);
        return;
      }

      // Server action: idempotent upsert + transition-guarded attendance_absent
      // notifications (sanctioned F2 pattern, RETURNING-free). marked_by is set
      // server-side from the authed session.
      void markedBy;
      const res = await saveAttendance({
        classId: selectedClassId,
        date: markDate,
        records: students.map(s => ({ studentId: s.student_id, status: s.status })),
      });

      if (!res.ok) {
        console.error('Attendance save error:', res.error);
        toast.error(msg('coach.attendance.saveError'));
      } else {
        toast.success(msg('coach.attendance.savedSuccess'));
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to save attendance:', err);
      toast.error(msg('coach.attendance.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const statusButtons: { status: AttendanceStatus; labelKey: string; icon: any; color: string }[] = [
    { status: 'present', labelKey: 'coach.attendance.present', icon: Check, color: 'bg-green-100 text-green-700 border-green-400' },
    { status: 'absent', labelKey: 'coach.attendance.absent', icon: X, color: 'bg-red-100 text-red-700 border-red-400' },
    { status: 'late', labelKey: 'coach.attendance.late', icon: Clock, color: 'bg-amber-100 text-amber-700 border-amber-400' },
    { status: 'excused', labelKey: 'coach.attendance.excused', icon: AlertCircle, color: 'bg-blue-100 text-blue-700 border-blue-400' },
  ];

  if (!messages) {
    return <div className="p-4 text-gray-400 text-sm">{'Loading...'}</div>;
  }

  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      {/* Header */}
      <div>
        <h2 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')}>
          {msg('coach.attendance.title')}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">{msg('coach.attendance.subtitle')}</p>
      </div>

      {/* Date Picker (today or up to 7 days back; no future) */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          {msg('attendanceHistory.coach.dateLabel')}
        </label>
        <input
          type="date"
          data-testid="coach-attendance-date"
          value={selectedDate}
          min={minDateStr}
          max={todayStr}
          onChange={e => setSelectedDate(e.target.value || todayStr)}
          className={cn(
            'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-[#cd1419]/30 focus:border-[#cd1419]'
          )}
        />
        <p className="mt-1 text-xs text-gray-400">
          {selectedDate !== todayStr
            ? msg('attendanceHistory.coach.pastBadge').replace('{date}', selectedDate)
            : msg('attendanceHistory.coach.hint')}
        </p>
      </div>

      {/* Class Selector */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          {msg('coach.attendance.selectClass')}
        </label>
        <select
          data-testid="attendance-class-select"
          value={selectedClassId}
          onChange={e => setSelectedClassId(e.target.value)}
          className={cn(
            'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-[#cd1419]/30 focus:border-[#cd1419]',
            'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23999%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-no-repeat',
            isRTL ? 'bg-[position:left_12px_center]' : 'bg-[position:right_12px_center]'
          )}
        >
          <option value="">{msg('coach.attendance.selectClassPlaceholder')}</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>
              {c.start_time}–{c.end_time} — {c.name} ({c.student_count} {msg('common.students')})
            </option>
          ))}
        </select>
        {selectedClass && (
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
            {selectedClass.discipline && (
              <span className="inline-flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {selectedClass.discipline}
              </span>
            )}
            {selectedClass.room && (
              <span className="inline-flex items-center gap-1">
                {selectedClass.room}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {selectedClass.student_count} {msg('common.students')}
            </span>
          </div>
        )}
      </div>

      {/* No class selected state */}
      {!selectedClassId && (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <ClipboardCheck className="mx-auto h-10 w-10 mb-3" />
          <p>{msg('coach.attendance.noClassSelected')}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <Calendar className="mx-auto h-10 w-10 mb-3 animate-pulse" />
          <p>{msg('common.loading')}</p>
        </div>
      )}

      {/* Student List + Attendance */}
      {!loading && selectedClassId && (
        <>
          {students.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
              <Users className="mx-auto h-10 w-10 mb-3" />
              <p>{msg('coach.attendance.noStudents')}</p>
            </div>
          ) : (
            <>
              {/* Mark All Present */}
              <button
                onClick={markAllPresent}
                className={cn(
                  'w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-2.5',
                  'text-sm font-medium text-green-700 hover:bg-green-100 transition-colors'
                )}
              >
                <Check className="h-4 w-4" />
                {msg('coach.attendance.markAllPresent')}
              </button>

              {/* Student Cards */}
              <div className="space-y-2">
                {students.map(student => {
                  const currentStatus = student.status;
                  return (
                    <div
                      key={student.student_id}
                      data-testid="attendance-student"
                      data-student-name={`${student.first_name} ${student.last_name}`.trim()}
                      data-status={student.status}
                      className="rounded-xl bg-white p-3 shadow-sm border border-gray-100"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-semibold text-gray-900 truncate', isRTL && 'font-arabic')}>
                            {student.first_name} {student.last_name}
                          </p>
                        </div>
                        {student.eligibilityLabel && (
                          <span
                            data-testid="attendance-eligibility"
                            className={cn(
                              'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                              student.eligible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                            )}
                          >
                            {student.eligible ? msg('coach.attendance.eligible') : msg('coach.attendance.notYet')} · {student.eligibilityLabel}
                          </span>
                        )}
                      </div>

                      {/* Status Toggle Buttons */}
                      <div className={cn('grid grid-cols-4 gap-1.5', isRTL ? 'text-right' : 'text-left')}>
                        {statusButtons.map(({ status, labelKey, icon: Icon, color }) => {
                          const isActive = currentStatus === status;
                          return (
                            <button
                              key={status}
                              data-testid={`att-status-${status}`}
                              onClick={() => toggleStatus(student.student_id, status)}
                              className={cn(
                                'flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all border',
                                isActive
                                  ? color + ' border-current'
                                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                              )}
                            >
                              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{msg(labelKey)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit Button */}
              <button
                data-testid="attendance-save"
                onClick={handleSubmit}
                disabled={saving}
                className={cn(
                  'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3',
                  'text-sm font-semibold text-white transition-colors',
                  saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#cd1419] hover:bg-[#b01216]'
                )}
              >
                {saving ? (
                  <>
                    <Calendar className="h-4 w-4 animate-pulse" />
                    {msg('coach.attendance.submitting')}
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="h-4 w-4" />
                    {msg('coach.attendance.submitAttendance')}
                  </>
                )}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
