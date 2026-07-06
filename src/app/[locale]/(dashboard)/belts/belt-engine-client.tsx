'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { promoteStudent } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { Award, TrendingUp, User, Calendar, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { beltPromotionSchema, isValidBeltPromotion } from '@/lib/validators/belts.schema';
import { getLocalizedName, getDateLocale } from '@/lib/i18n/helpers';

type UserName = {
  first_name_ar?: string | null;
  first_name_en?: string | null;
  first_name_fr?: string | null;
  last_name_ar?: string | null;
  last_name_en?: string | null;
  last_name_fr?: string | null;
};
type Student = { id: string; current_belt_rank: string; belt_promotion_date: string | null; user: Partial<UserName> };
type Discipline = { id: string; name_ar: string; name_en: string; name_fr: string };
type Coach = { id: string; user: Partial<UserName> };
type BeltHierarchy = {
  id: string; discipline_id: string; rank: string;
  name_ar: string; name_en: string; name_fr: string;
  sort_order: number; stripe_count: number; is_black_belt: boolean;
};
type Promotion = {
  id: string; student_id: string; coach_id: string | null;
  discipline_id: string; belt_hierarchy_id: string;
  from_rank: string | null; to_rank: string; promotion_date: string;
  notes_en: string | null; notes_ar: string | null; notes_fr: string | null;
  created_at: string;
};

// ─── Belt Display Map: all 20 belt_rank_enum values ───
const BELT_DISPLAY: Record<string, { color: string; label: { ar: string; en: string; fr: string } }> = {
  white:        { color: 'bg-white border-2 border-gray-300 text-gray-700', label: { ar: 'أبيض', en: 'White', fr: 'Blanche' } },
  white_yellow: { color: 'bg-gradient-to-r from-white to-yellow-300 border border-gray-300 text-gray-700', label: { ar: 'أبيض/أصفر', en: 'White/Yellow', fr: 'Blanc/Jaune' } },
  yellow:       { color: 'bg-yellow-400 text-primary-foreground', label: { ar: 'أصفر', en: 'Yellow', fr: 'Jaune' } },
  yellow_orange:{ color: 'bg-gradient-to-r from-yellow-400 to-orange-400 text-primary-foreground', label: { ar: 'أصفر/برتقالي', en: 'Yellow/Orange', fr: 'Jaune/Orange' } },
  orange:       { color: 'bg-orange-500 text-primary-foreground', label: { ar: 'برتقالي', en: 'Orange', fr: 'Orange' } },
  orange_green: { color: 'bg-gradient-to-r from-orange-400 to-green-400 text-primary-foreground', label: { ar: 'برتقالي/أخضر', en: 'Orange/Green', fr: 'Orange/Vert' } },
  green:        { color: 'bg-green-500 text-primary-foreground', label: { ar: 'أخضر', en: 'Green', fr: 'Verte' } },
  green_blue:   { color: 'bg-gradient-to-r from-green-400 to-blue-400 text-primary-foreground', label: { ar: 'أخضر/أزرق', en: 'Green/Blue', fr: 'Vert/Bleu' } },
  blue:         { color: 'bg-blue-500 text-primary-foreground', label: { ar: 'أزرق', en: 'Blue', fr: 'Bleue' } },
  blue_purple:  { color: 'bg-gradient-to-r from-blue-400 to-purple-400 text-primary-foreground', label: { ar: 'أزرق/أرجواني', en: 'Blue/Purple', fr: 'Bleu/Violet' } },
  purple:       { color: 'bg-purple-500 text-primary-foreground', label: { ar: 'أرجواني', en: 'Purple', fr: 'Violette' } },
  purple_brown: { color: 'bg-gradient-to-r from-purple-400 to-amber-600 text-primary-foreground', label: { ar: 'أرجواني/بني', en: 'Purple/Brown', fr: 'Violet/Marron' } },
  brown:        { color: 'bg-amber-700 text-primary-foreground', label: { ar: 'بني', en: 'Brown', fr: 'Marron' } },
  brown_black:  { color: 'bg-gradient-to-r from-amber-700 to-black text-primary-foreground', label: { ar: 'بني/أسود', en: 'Brown/Black', fr: 'Marron/Noir' } },
  red:          { color: 'bg-red-600 text-primary-foreground', label: { ar: 'أحمر', en: 'Red', fr: 'Rouge' } },
  black_1:      { color: 'bg-black text-primary-foreground ring-1 ring-red-500', label: { ar: 'أسود °1', en: 'Black 1°', fr: 'Noir 1°' } },
  black_2:      { color: 'bg-black text-primary-foreground ring-1 ring-white/50', label: { ar: 'أسود °2', en: 'Black 2°', fr: 'Noir 2°' } },
  black_3:      { color: 'bg-black text-primary-foreground ring-1 ring-yellow-500', label: { ar: 'أسود °3', en: 'Black 3°', fr: 'Noir 3°' } },
  black_4:      { color: 'bg-black text-primary-foreground ring-1 ring-blue-500', label: { ar: 'أسود °4', en: 'Black 4°', fr: 'Noir 4°' } },
  black_5:      { color: 'bg-black text-primary-foreground ring-1 ring-red-500 ring-offset-1', label: { ar: 'أسود °5', en: 'Black 5°', fr: 'Noir 5°' } },
};

const selectClass = 'w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

export function BeltEngineClient({
  students, disciplines, coaches, beltHierarchies, promotions, locale,
}: {
  students: Student[]; disciplines: Discipline[]; coaches: Coach[];
  beltHierarchies: BeltHierarchy[]; promotions: Promotion[]; locale: string;
}) {
  const t = useTranslations('belts');
  const { toast } = useToast();
  const router = useRouter();
  const isRTL = locale === 'ar';
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // ─── State ───
  const [step, setStep] = useState(0); // 0: Student+Discipline, 1: Belt+Coach, 2: Review+Confirm
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState('');
  const [selectedBelt, setSelectedBelt] = useState('');
  const [selectedCoach, setSelectedCoach] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'promote' | 'history'>('promote');

  // ─── Derived ───
  const filteredBelts = beltHierarchies.filter(b => !selectedDiscipline || b.discipline_id === selectedDiscipline);
  const studentPromotions = promotions.filter(p => !selectedStudent || p.student_id === selectedStudent);
  const selectedStudentData = students.find(s => s.id === selectedStudent);
  const selectedDisciplineData = disciplines.find(d => d.id === selectedDiscipline);
  const selectedBeltData = beltHierarchies.find(b => b.id === selectedBelt);
  const selectedCoachData = coaches.find(c => c.id === selectedCoach);

  // ─── Helpers ───
  const getStudentName = (s: Student) => {
    const u = s.user || {};
    return ['en', 'fr'].includes(locale)
      ? [u.first_name_en || u.first_name_ar, u.last_name_en || u.last_name_ar].filter(Boolean).join(' ') || ''
      : [u.first_name_ar, u.last_name_ar].filter(Boolean).join(' ') || u.first_name_en || '';
  };
  const getBeltColor = (rank: string) => BELT_DISPLAY[rank]?.color || 'bg-gray-100 text-gray-700';
  const getBeltLabel = (rank: string) => {
    if (!rank) return t('no_belt');
    const lbl = BELT_DISPLAY[rank]?.label;
    if (!lbl) return rank;
    if (locale === 'ar') return lbl.ar;
    if (locale === 'fr') return lbl.fr;
    return lbl.en;
  };
  const getDisciplineName = (d: Discipline) => getLocalizedName(d, locale);
  const getCoachName = (c: Coach) => {
    const u = c.user || {};
    return [u.first_name_en || u.first_name_ar, u.last_name_en || ''].filter(Boolean).join(' ') || '';
  };

  // ─── Step Navigation ───
  const canGoNext = (): boolean => {
    if (step === 0) return !!selectedStudent && !!selectedDiscipline;
    if (step === 1) return !!selectedBelt;
    return true;
  };

  const goNext = () => { if (canGoNext()) setStep(s => Math.min(s + 1, 2)); };
  const goBack = () => { setStep(s => Math.max(s - 1, 0)); };

  // Reset step when tab changes or selections change
  const resetPromotion = () => {
    setStep(0);
    setSelectedStudent('');
    setSelectedDiscipline('');
    setSelectedBelt('');
    setSelectedCoach('');
    setNotes('');
  };

  // ─── Atomic Promotion Handler (2.5 + 2.6 + 2.3) ───
  const handlePromote = async () => {
    if (!selectedStudent || !selectedDiscipline || !selectedBelt) {
      toast({ title: t('error_title'), description: t('validation_fill_all_fields'), variant: 'destructive' });
      return;
    }
    // promote_student requires a coach (belt_promotions.coach_id is NOT NULL).
    if (!selectedCoach) {
      toast({ title: t('error_title'), description: t('validation_coach_required'), variant: 'destructive' });
      return;
    }

    // ─── Zod Validation ───
    const promoDate = new Date().toISOString().split('T')[0];
    const validation = beltPromotionSchema.safeParse({
      student_id: selectedStudent,
      discipline_id: selectedDiscipline,
      target_belt_rank: selectedBeltData?.rank,
      coach_id: selectedCoach || undefined,
      promotion_date: promoDate,
      notes: notes || undefined,
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      toast({ title: t('error_title'), description: firstIssue?.message || t('validation_error'), variant: 'destructive' });
      return;
    }

    // ─── Belt Rank Ordering Validation (2.6) ───
    const currentStudent = students.find(s => s.id === selectedStudent);
    const currentRank = currentStudent?.current_belt_rank;
    const targetRank = selectedBeltData?.rank || '';
    if (!isValidBeltPromotion(currentRank, targetRank)) {
      toast({ title: t('error_title'), description: t('validation_rank_not_higher'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    // ─── Optimistic UI: store original values for rollback ───
    const prevRank: string | null = currentStudent?.current_belt_rank ?? null;
    const prevDate: string | null = currentStudent?.belt_promotion_date ?? null;
    const originalStudents = [...students];

    // Optimistic update
    if (currentStudent) {
      currentStudent.current_belt_rank = targetRank;
      currentStudent.belt_promotion_date = promoDate;
    }

    // ─── Atomic Promotion via the promote_student RPC (000025) ───
    // Replaces the old two-write + manual-JS-rollback path: the RPC inserts
    // belt_promotions AND updates students.current_belt_rank in ONE transaction,
    // then the server action emits belt_promoted (+ guardian fan-out).
    try {
      const res = await promoteStudent({
        studentId: selectedStudent,
        disciplineId: selectedDiscipline,
        toHierarchyId: selectedBelt,
        coachId: selectedCoach,
        promotionDate: promoDate,
        notes: notes || undefined,
      });
      if (!res.ok) throw new Error(res.error);

      // ─── Success ───
      toast({ title: t('promote_success_title'), description: t('promote_success_description') });
      router.refresh(); // 2.3: Auto-refresh to refetch server data
      resetPromotion();
    } catch (err: unknown) {
      // ─── Rollback optimistic UI on error ───
      if (currentStudent) {
        currentStudent.current_belt_rank = prevRank ?? '';
        currentStudent.belt_promotion_date = prevDate;
      }
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: t('error_title'), description: message || t('promotion_failed'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      {/* ─── Tab Navigation ─── */}
      <div className="flex gap-2 border-b pb-2">
        <button onClick={() => { setActiveTab('promote'); resetPromotion(); }}
          className={cn('px-4 py-2 text-sm font-medium rounded-t-lg', activeTab === 'promote' ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600' : 'text-gray-500')}>
          <TrendingUp className="inline h-4 w-4 me-1" />{t('promote')}
        </button>
        <button onClick={() => { setActiveTab('history'); }}
          className={cn('px-4 py-2 text-sm font-medium rounded-t-lg', activeTab === 'history' ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600' : 'text-gray-500')}>
          <Award className="inline h-4 w-4 me-1" />{t('history')}
        </button>
      </div>

      {activeTab === 'promote' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className={cn(isRTL && 'font-arabic')}>{t('promote')}</CardTitle>
              {/* ─── Step Indicator ─── */}
              <div className="flex items-center gap-2 pt-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-1">
                    <div className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold',
                      step === i ? 'bg-primary-600 text-primary-foreground' : step > i ? 'bg-green-500 text-primary-foreground' : 'bg-gray-200 text-gray-500'
                    )}>
                      {step > i ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={cn('text-xs', step === i ? 'text-primary-700 font-medium' : 'text-gray-400')}>
                      {i === 0 ? t('step_student_discipline') : i === 1 ? t('step_belt_coach') : t('step_review')}
                    </span>
                    {i < 2 && <div className={cn('h-px w-4', step > i ? 'bg-green-400' : 'bg-gray-200')} />}
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ─── STEP 0: Student + Discipline ─── */}
              {step === 0 && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{t('student_label')}</label>
                    <select data-testid="be-student" className={selectClass} value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>
                      <option value="">{t('select_student')}</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{getStudentName(s)}</option>
                      ))}
                    </select>
                    {selectedStudentData && (
                      <span data-testid="be-current-rank" data-rank={selectedStudentData.current_belt_rank || ''} className="hidden" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{t('discipline_label')}</label>
                    <select data-testid="be-discipline" className={selectClass} value={selectedDiscipline}
                      onChange={e => { setSelectedDiscipline(e.target.value); setSelectedBelt(''); }}>
                      <option value="">{t('select_discipline')}</option>
                      {disciplines.filter(d => beltHierarchies.some(b => b.discipline_id === d.id)).map(d => (
                        <option key={d.id} value={d.id}>{getDisciplineName(d)}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* ─── STEP 1: Belt + Coach ─── */}
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{t('new_belt')}</label>
                    <select data-testid="be-belt" className={selectClass} value={selectedBelt} onChange={e => setSelectedBelt(e.target.value)} disabled={!selectedDiscipline}>
                      <option value="">{t('select_belt')}</option>
                      {filteredBelts.map(b => (
                        <option key={b.id} value={b.id} data-rank={b.rank} data-sort={b.sort_order}>
                          {getLocalizedName(b, locale)}
                          {b.is_black_belt ? ' 🏆' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{t('coach_label')}</label>
                    <select data-testid="be-coach" className={selectClass} value={selectedCoach} onChange={e => setSelectedCoach(e.target.value)}>
                      <option value="">{t('select_coach')}</option>
                      {coaches.map(c => (
                        <option key={c.id} value={c.id}>{getCoachName(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{t('notes_label')}</label>
                    <textarea className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500"
                      value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('promotion_notes')} />
                  </div>
                </>
              )}

              {/* ─── STEP 2: Review + Confirm ─── */}
              {step === 2 && (
                <div className="space-y-3 text-sm">
                  <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('student_label')}</span>
                      <span className="font-medium text-gray-900">{selectedStudentData ? getStudentName(selectedStudentData) : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('discipline_label')}</span>
                      <span className="font-medium text-gray-900">{selectedDisciplineData ? getDisciplineName(selectedDisciplineData) : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('current_belt_label')}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', getBeltColor(selectedStudentData?.current_belt_rank || ''))}>
                        {getBeltLabel(selectedStudentData?.current_belt_rank || '')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('new_belt')}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', getBeltColor(selectedBeltData?.rank || ''))}>
                        {selectedBeltData ? getLocalizedName(selectedBeltData, locale) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('coach_label')}</span>
                      <span className="font-medium text-gray-900">{selectedCoachData ? getCoachName(selectedCoachData) : t('none')}</span>
                    </div>
                    {notes && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{t('notes_label')}</span>
                        <span className="font-medium text-gray-900 max-w-[200px] truncate">{notes}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-gray-500">{t('promotion_date_label')}</span>
                      <span className="font-medium text-gray-900">{new Date().toLocaleDateString(getDateLocale(locale))}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Navigation Buttons ─── */}
              <div className="flex gap-2">
                {step > 0 && (
                  <Button variant="outline" onClick={goBack} className="flex-1">
                    <ArrowLeft className="h-4 w-4 me-1" />{t('back')}
                  </Button>
                )}
                {step < 2 ? (
                  <Button data-testid="be-next" onClick={goNext} disabled={!canGoNext()} className="flex-1">
                    {t('next')}<ArrowRight className="h-4 w-4 ms-1" />
                  </Button>
                ) : (
                  <Button data-testid="be-confirm" onClick={handlePromote} disabled={submitting} className="flex-1">
                    {submitting ? t('promoting') : t('confirm_promotion')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ─── Student List Panel ─── */}
          <Card>
            <CardHeader><CardTitle className={cn(isRTL && 'font-arabic')}>{t('students_by_belt')}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {students.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">{t('no_students')}</p>
                ) : students.map(s => (
                  <div key={s.id}
                    className={cn('flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-gray-50',
                      selectedStudent === s.id && 'ring-2 ring-primary-500 bg-primary-50')}
                    onClick={() => { setSelectedStudent(s.id); if (step !== 0) { setStep(0); } }}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{getStudentName(s)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', getBeltColor(s.current_belt_rank))}>
                            {getBeltLabel(s.current_belt_rank)}
                          </span>
                          {s.belt_promotion_date && (
                            <span className="text-xs text-gray-400">
                              <Calendar className="inline h-3 w-3 me-1" />
                              {new Date(s.belt_promotion_date).toLocaleDateString(getDateLocale(locale))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <TrendingUp className="h-4 w-4 text-gray-400" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ─── History Tab ─── */
        <Card>
          <CardHeader><CardTitle className={cn(isRTL && 'font-arabic')}>{t('history')}</CardTitle></CardHeader>
          <CardContent>
            {studentPromotions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">{t('no_promotions')}</p>
            ) : (
              <div className="space-y-3">
                {studentPromotions.map(p => {
                  const stu = students.find(s => s.id === p.student_id);
                  const belt = beltHierarchies.find(b => b.id === p.belt_hierarchy_id);
                  const disc = disciplines.find(d => d.id === p.discipline_id);
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-0.5">
                          {p.from_rank && <span className={cn('text-xs px-1.5 py-0.5 rounded-full', getBeltColor(p.from_rank))}>{getBeltLabel(p.from_rank)}</span>}
                          <span className="text-gray-300 text-xs">↓</span>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full', getBeltColor(p.to_rank))}>
                            {belt ? getLocalizedName(belt, locale) : p.to_rank}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{stu ? getStudentName(stu) : p.student_id}</p>
                          <p className="text-xs text-gray-500">
                            {disc ? getDisciplineName(disc) : ''}
                            <span className="mx-1">·</span>
                            {new Date(p.promotion_date).toLocaleDateString(getDateLocale(locale))}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
