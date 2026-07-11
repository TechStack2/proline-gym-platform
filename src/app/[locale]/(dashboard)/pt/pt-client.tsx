'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModalPortal } from '@/components/shared/modal-portal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useCaughtErrorText } from '@/lib/errors/use-error-text';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dumbbell, Package, Clock, CreditCard, CheckCircle, X,
  Pencil, Trash2, AlertTriangle, Users, Hourglass, PlayCircle,
} from 'lucide-react';
import { ptPackageInsertSchema, ptAssignmentInsertSchema } from '@/lib/validators/pt.schema';
import { getLocalizedName } from '@/lib/i18n/helpers';
import { approvePtRequest, rejectPtRequest } from './actions';

// ─── Local form schema (strings for HTML inputs; validated+converted in handler) ───
const ptPackageFormSchema = z.object({
  name_ar: z.string().min(1, 'Name (AR) is required'),
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_fr: z.string(),
  description_ar: z.string(),
  description_en: z.string(),
  description_fr: z.string(),
  session_count: z.string().min(1, 'Session count is required'),
  price_usd: z.string().min(1, 'Price is required'),
  price_lbp: z.string(),
  validity_days: z.string(),
});

type PtPackageFormValues = z.infer<typeof ptPackageFormSchema>;

type PtStudent = {
  id: string;
  user: Partial<{
    first_name_ar: string | null;
    first_name_en: string | null;
    first_name_fr: string | null;
    last_name_ar: string | null;
    last_name_en: string | null;
    last_name_fr: string | null;
  }>;
};

type PtCoach = {
  id: string;
  user: Partial<{
    first_name_ar: string | null;
    first_name_en: string | null;
    first_name_fr: string | null;
    last_name_ar: string | null;
    last_name_en: string | null;
  }>;
};

type PtPackageRow = {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  session_count: number;
  price_usd: number;
  price_lbp?: number | null;
  validity_days: number | null;
  description_ar?: string | null;
  description_en?: string | null;
  description_fr?: string | null;
  coach_id?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  gym_id?: string;
};

type PtAssignmentRow = {
  id: string;
  student_id: string;
  package_id: string;
  coach_id: string;
  sessions_total: number;
  sessions_used: number;
  sessions_remaining: number;
  purchased_at: string;
  expires_at?: string | null;
  is_active: boolean;
};

type PendingRequest = {
  id: string;
  student_id: string;
  package_id: string;
  coach_id: string | null;
  sessions_total: number;
  requested_at: string | null;
};

type Props = {
  packages: PtPackageRow[];
  students: PtStudent[];
  coaches: PtCoach[];
  assignments: PtAssignmentRow[];
  pendingRequests: PendingRequest[];
  locale: string;
  gymId: string;
};

function getStudentName(s: PtStudent): string {
  const u = s.user || {};
  return u.first_name_en || u.first_name_ar || '';
}

function getCoachName(c: PtCoach): string {
  const u = c.user || {};
  return u.first_name_en || u.first_name_ar || '';
}

// INTAKE-FOCUS: the shared modal backdrop lives at MODULE SCOPE (stable type ref).
// Inside the render body it got a new identity each keystroke → React remounted the
// modal subtree (create/edit-package inputs) and dropped the cursor. Props-only —
// hoists cleanly. Same class of fix as add-student-wizard's field wrapper.
const ModalBackdrop = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {children}
    </div>
  </ModalPortal>
);

export function PTPackagesClient({ packages: initialPkgs, students, coaches, assignments: initialAssignments, pendingRequests: initialPending, locale, gymId }: Props) {
  const t = useTranslations('pt');
  const errCaught = useCaughtErrorText();
  const router = useRouter();
  const [packages, setPackages] = useState(initialPkgs);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [pending, setPending] = useState(initialPending);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<PtPackageRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PtPackageRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [assignPkg, setAssignPkg] = useState<string | null>(null);
  const [assignStudent, setAssignStudent] = useState('');
  const [assignCoach, setAssignCoach] = useState('');
  const [reqCoach, setReqCoach] = useState<Record<string, string>>({});
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const isAdmin = true; // Server filters by is_staff() RLS

  // ── Create form ─────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PtPackageFormValues>({
    resolver: zodResolver(ptPackageFormSchema),
    defaultValues: {
      name_ar: '', name_en: '', name_fr: '',
      description_ar: '', description_en: '', description_fr: '',
      session_count: '', price_usd: '', price_lbp: '', validity_days: '90',
    },
  });

  // ── Edit form ───────────────────────────────────────────────────
  const editForm = useForm<PtPackageFormValues>({
    resolver: zodResolver(ptPackageFormSchema),
    defaultValues: {
      name_ar: '', name_en: '', name_fr: '',
      description_ar: '', description_en: '', description_fr: '',
      session_count: '', price_usd: '', price_lbp: '', validity_days: '90',
    },
  });

  // ── CREATE handler ──────────────────────────────────────────────
  const handleCreate = async (data: PtPackageFormValues) => {
    const canonical = {
      name_ar: data.name_ar || data.name_en,
      name_en: data.name_en,
      name_fr: data.name_fr || data.name_en,
      description_ar: data.description_ar || null,
      description_en: data.description_en || null,
      description_fr: data.description_fr || null,
      session_count: parseInt(data.session_count, 10),
      price_usd: parseFloat(data.price_usd),
      price_lbp: data.price_lbp ? parseFloat(data.price_lbp) : null,
      gym_id: gymId,
      validity_days: parseInt(data.validity_days, 10) || 90,
    };

    const parsed = ptPackageInsertSchema.safeParse(canonical);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || t('validation_error'));
      return;
    }

    setSubmitting(true);
    try {
      const { data: created, error } = await supabase
        .from('pt_packages')
        .insert(parsed.data)
        .select()
        .single();

      if (error) throw error;

      setPackages((prev) => [...prev, created as PtPackageRow]);
      setShowCreate(false);
      reset();
      toast.success(t('create_success'));
    } catch (err: any) {
      toast.error(errCaught(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── EDIT handler ────────────────────────────────────────────────
  const openEditModal = (pkg: PtPackageRow) => {
    setEditTarget(pkg);
    editForm.reset({
      name_ar: pkg.name_ar || '',
      name_en: pkg.name_en || '',
      name_fr: pkg.name_fr || '',
      description_ar: pkg.description_ar || '',
      description_en: pkg.description_en || '',
      description_fr: pkg.description_fr || '',
      session_count: String(pkg.session_count),
      price_usd: String(pkg.price_usd),
      price_lbp: pkg.price_lbp != null ? String(pkg.price_lbp) : '',
      validity_days: pkg.validity_days != null ? String(pkg.validity_days) : '90',
    });
  };

  const handleEdit = async (data: PtPackageFormValues) => {
    if (!editTarget) return;

    const canonical = {
      name_ar: data.name_ar || data.name_en,
      name_en: data.name_en,
      name_fr: data.name_fr || data.name_en,
      description_ar: data.description_ar || null,
      description_en: data.description_en || null,
      description_fr: data.description_fr || null,
      session_count: parseInt(data.session_count, 10),
      price_usd: parseFloat(data.price_usd),
      price_lbp: data.price_lbp ? parseFloat(data.price_lbp) : null,
      gym_id: gymId,
      validity_days: parseInt(data.validity_days, 10) || 90,
    };

    const parsed = ptPackageInsertSchema.safeParse(canonical);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || t('validation_error'));
      return;
    }

    setSubmitting(true);
    try {
      const { data: updated, error } = await supabase
        .from('pt_packages')
        .update(parsed.data)
        .eq('id', editTarget.id)
        .eq('gym_id', gymId)
        .select()
        .single();

      if (error) throw error;

      setPackages((prev) =>
        prev.map((p) => (p.id === editTarget.id ? { ...p, ...(updated as PtPackageRow) } : p)),
      );
      setEditTarget(null);
      toast.success(t('update_success'));
    } catch (err: any) {
      toast.error(errCaught(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── DELETE handler (soft-delete via deleted_at) ────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('pt_packages')
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', deleteTarget.id)
        .eq('gym_id', gymId);

      if (error) throw error;

      setPackages((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(t('delete_success'));
    } catch (err: any) {
      toast.error(errCaught(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── TOGGLE package active/inactive ─────────────────────────────
  const handleToggleActive = async (pkg: PtPackageRow) => {
    const newState = !pkg.is_active;
    const previousPackages = [...packages];
    setPackages((prev) =>
      prev.map((p) => (p.id === pkg.id ? { ...p, is_active: newState } : p)),
    );

    try {
      const { error } = await supabase
        .from('pt_packages')
        .update({ is_active: newState })
        .eq('id', pkg.id)
        .eq('gym_id', gymId);

      if (error) throw error;
    } catch (err: any) {
      setPackages(previousPackages);
      toast.error(errCaught(err));
    }
  };

  // ── ASSIGN handler — creates pt_assignments credit record ──────
  const handleAssign = async (pkgId: string) => {
    if (!assignStudent || !assignCoach) {
      toast.error(t('validation_error'));
      return;
    }

    const pkg = packages.find(p => p.id === pkgId);
    if (!pkg) return;

    const payload = {
      student_id: assignStudent,
      package_id: pkgId,
      coach_id: assignCoach,
      sessions_total: pkg.session_count,
      sessions_used: 0,
    };

    const parsed = ptAssignmentInsertSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || t('validation_error'));
      return;
    }

    setSubmitting(true);
    try {
      const { data: created, error } = await supabase
        .from('pt_assignments')
        .insert(parsed.data)
        .select()
        .single();

      if (error) throw error;

      setAssignments((prev) => [...prev, created as PtAssignmentRow]);
      setAssignPkg(null);
      setAssignStudent('');
      setAssignCoach('');
      toast.success(t('assign_success'));
    } catch (err: any) {
      toast.error(errCaught(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Approve a pending PT request (auto-invoice + notify) ───────
  const handleApprove = async (req: PendingRequest) => {
    setProcessing(req.id);
    try {
      const coachId = reqCoach[req.id] || req.coach_id || null;
      const result = await approvePtRequest(req.id, { coachId });
      if (!result.ok) throw new Error(result.error);
      setPending((prev) => prev.filter((p) => p.id !== req.id));
      toast.success(t('approve_success'));
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message === 'coach_required' ? t('coach_required') : errCaught(err));
    } finally {
      setProcessing(null);
    }
  };

  // ── Reject a pending PT request ────────────────────────────────
  const handleReject = async (req: PendingRequest) => {
    setProcessing(req.id);
    try {
      const result = await rejectPtRequest(req.id, '');
      if (!result.ok) throw new Error(result.error);
      setPending((prev) => prev.filter((p) => p.id !== req.id));
      toast.success(t('reject_success'));
      router.refresh();
    } catch (err: any) {
      toast.error(errCaught(err));
    } finally {
      setProcessing(null);
    }
  };

  // ── Log a PT session — decrements remaining credits (M-A6) ─────
  const handleLogSession = async (assignment: PtAssignmentRow) => {
    if (assignment.sessions_remaining <= 0) return;
    setProcessing(assignment.id);
    // optimistic decrement
    setAssignments((prev) =>
      prev.map((a) => (a.id === assignment.id ? { ...a, sessions_used: a.sessions_used + 1, sessions_remaining: a.sessions_remaining - 1 } : a)),
    );
    try {
      const { error } = await supabase.rpc('increment_sessions_used', { assignment_id: assignment.id });
      if (error) throw error;
      toast.success(t('log_session_success'));
    } catch (err: any) {
      // revert on failure
      setAssignments((prev) =>
        prev.map((a) => (a.id === assignment.id ? { ...a, sessions_used: a.sessions_used - 1, sessions_remaining: a.sessions_remaining + 1 } : a)),
      );
      toast.error(errCaught(err));
    } finally {
      setProcessing(null);
    }
  };

  // ── Get assignment for a package+student combo ─────────────────
  const getAssignment = (pkgId: string, studentId?: string): PtAssignmentRow | undefined => {
    if (!studentId) return undefined;
    return assignments.find(a => a.package_id === pkgId && a.student_id === studentId && a.is_active);
  };

  // ── Render form fields ─────────────────────────────────────────
  const renderFormFields = (reg: any, errs: Record<string, any>) => (
    <>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('name_en')} {...reg('name_en')} />
        {errs.name_en && <p className="text-red-500 text-xs mt-1">{errs.name_en.message as string}</p>}
      </div>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('name_ar_placeholder')} {...reg('name_ar')} />
        {errs.name_ar && <p className="text-red-500 text-xs mt-1">{errs.name_ar.message as string}</p>}
      </div>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('name_fr')} {...reg('name_fr')} />
      </div>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('description_en')} {...reg('description_en')} />
      </div>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('description_ar')} {...reg('description_ar')} />
      </div>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('description_fr')} {...reg('description_fr')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">{t('session_count')}</label>
          <input type="number" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('session_count')} />
          {errs.session_count && <p className="text-red-500 text-xs mt-1">{errs.session_count.message as string}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('price_usd')}</label>
          <input type="number" step="0.01" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('price_usd')} />
          {errs.price_usd && <p className="text-red-500 text-xs mt-1">{errs.price_usd.message as string}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">{t('price_lbp')}</label>
          <input type="number" step="0.01" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('price_lbp')} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('validity_days')}</label>
          <input type="number" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('validity_days')} />
        </div>
      </div>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Package className="h-4 w-4 me-1.5" />
          {t('new_package')}
        </Button>
      </div>

      {/* ── Pending PT requests (approve / reject) ───────────────── */}
      {pending.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className={cn('text-base flex items-center gap-2', isRTL && 'font-arabic')}>
              <Hourglass className="h-4 w-4 text-amber-500" />
              {t('pending_requests')}
              <Badge variant="secondary" className="text-xs">{pending.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((req) => {
              const student = students.find((s) => s.id === req.student_id);
              const pkg = packages.find((p) => p.id === req.package_id);
              // J3 PT-GUARDS: a coach must be resolvable to approve (else the package
              // is permanently unbookable). Effective = the request's own coach or the
              // one picked here (chips, not a raw select).
              const effectiveCoach = reqCoach[req.id] || req.coach_id || null;
              const preferredCoach = req.coach_id ? coaches.find((c) => c.id === req.coach_id) : null;
              return (
                <div key={req.id} data-testid="pt-pending-request" data-package={req.package_id} className="flex flex-col gap-2 rounded-xl border bg-amber-50/40 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className={cn('text-sm font-medium text-gray-900 truncate', isRTL && 'font-arabic')}>
                        {student ? getStudentName(student) : req.student_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {pkg ? getLocalizedName(pkg, locale) : req.package_id.slice(0, 8)} · {req.sessions_total} {t('sessions')}
                      </p>
                      {preferredCoach && (
                        <p className="mt-0.5 text-xs font-medium text-gray-600" data-testid="pt-req-coach">{t('coach_label', { coach: getCoachName(preferredCoach) })}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" data-testid="pt-req-approve" disabled={processing === req.id || !effectiveCoach} onClick={() => handleApprove(req)}>
                        <CheckCircle className="h-3.5 w-3.5 me-1" />
                        {t('approve')}
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" disabled={processing === req.id} onClick={() => handleReject(req)}>
                        <X className="h-3.5 w-3.5 me-1" />
                        {t('reject')}
                      </Button>
                    </div>
                  </div>
                  {/* No preferred coach → pick one (chips) before approving. */}
                  {!req.coach_id && (
                    <div data-testid="pt-req-coach-picker" className="rounded-lg bg-white/70 px-2.5 py-2">
                      <p className={cn('mb-1.5 text-xs font-medium text-amber-800', isRTL && 'font-arabic text-right')}>{t('assign_coach_to_book')}</p>
                      {coaches.length === 0 ? (
                        <p className="text-xs text-amber-700">{t('no_coaches_to_assign')}</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {coaches.map((c) => (
                            <button key={c.id} type="button" data-testid="pt-req-coach-chip" data-id={c.id}
                              onClick={() => setReqCoach((prev) => ({ ...prev, [req.id]: c.id }))}
                              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
                                reqCoach[req.id] === c.id ? 'border-primary-700 bg-red-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                              {getCoachName(c)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── CREATE Form Modal ─────────────────────────────────── */}
      {showCreate && (
        <form onSubmit={handleSubmit(handleCreate)}>
          <ModalBackdrop onClose={() => { setShowCreate(false); reset(); }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-bold">{t('new_package')}</h3>
                <button type="button" onClick={() => { setShowCreate(false); reset(); }} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                {renderFormFields(register, errors)}
                <Button type="submit" disabled={submitting} className="w-full">{submitting ? '...' : t('create')}</Button>
              </div>
            </div>
          </ModalBackdrop>
        </form>
      )}

      {/* ── EDIT Form Modal ───────────────────────────────────── */}
      {editTarget && (
        <form onSubmit={editForm.handleSubmit(handleEdit)}>
          <ModalBackdrop onClose={() => setEditTarget(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-bold">{t('edit_package')}</h3>
                <button type="button" onClick={() => setEditTarget(null)} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                {renderFormFields(editForm.register, editForm.formState.errors)}
                <Button type="submit" disabled={submitting} className="w-full">{submitting ? '...' : t('save_changes')}</Button>
              </div>
            </div>
          </ModalBackdrop>
        </form>
      )}

      {/* ── DELETE Confirmation Modal ─────────────────────────── */}
      {deleteTarget && (
        <ModalBackdrop onClose={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{t('delete_confirm_title')}</h3>
                <p className="text-sm text-gray-500">{t('delete_confirm_body')}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={submitting}>
                {t('cancel')}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={submitting}>
                {submitting ? t('deleting') : t('delete')}
              </Button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ── Package Cards ─────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        {packages.map(pkg => {
          const pkgAssignments = assignments.filter(a => a.package_id === pkg.id && a.is_active);

          return (
            <Card key={pkg.id} className={cn('hover:shadow-md transition-shadow', !pkg.is_active && 'opacity-60')}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center">
                      <Dumbbell className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>
                        {getLocalizedName(pkg, locale)}
                      </CardTitle>
                      <p className="text-xs text-gray-400">{pkg.session_count} {t('sessions')}</p>
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="text-2xl font-bold text-primary-700">${pkg.price_usd}</span>
                    {pkg.price_lbp && (
                      <p className="text-xs text-gray-400">{pkg.price_lbp.toLocaleString()} LBP</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>{pkg.validity_days} {t('validity')}</span>
                </div>

                {/* ── Credit Tracking ────────────────────────── */}
                {pkgAssignments.length > 0 && (
                  <div className="pt-2 border-t space-y-1.5">
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      {t('credit_tracking')}
                    </p>
                    {pkgAssignments.map(a => {
                      const student = students.find(s => s.id === a.student_id);
                      return (
                        <div key={a.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5">
                          <span className="truncate max-w-[100px]">{student ? getStudentName(student) : a.student_id.slice(0, 8)}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs">
                              {t('sessions_remaining', { remaining: a.sessions_remaining, total: a.sessions_total })}
                            </Badge>
                            <button
                              type="button"
                              disabled={processing === a.id || a.sessions_remaining <= 0}
                              onClick={() => handleLogSession(a)}
                              title={t('log_session')}
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-primary-600 hover:bg-primary-50 disabled:opacity-40"
                            >
                              <PlayCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2 border-t space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500"><CheckCircle className="h-3 w-3 text-green-500" />{t('certified_coach')}</div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500"><CheckCircle className="h-3 w-3 text-green-500" />{t('custom_plan')}</div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500"><CheckCircle className="h-3 w-3 text-green-500" />{t('flexible_schedule')}</div>
                </div>

                {/* ── Assign to Student ──────────────────────── */}
                {assignPkg === pkg.id ? (
                  <div className="space-y-2 pt-2 border-t">
                    <select
                      className="w-full px-3 py-2 text-sm border rounded-lg"
                      value={assignStudent}
                      onChange={e => setAssignStudent(e.target.value)}
                    >
                      <option value="">{t('select_student')}</option>
                      {students.map((s) => (<option key={s.id} value={s.id}>{getStudentName(s)}</option>))}
                    </select>
                    <select
                      className="w-full px-3 py-2 text-sm border rounded-lg"
                      value={assignCoach}
                      onChange={e => setAssignCoach(e.target.value)}
                    >
                      <option value="">{t('select_coach')}</option>
                      {coaches.map((c) => (<option key={c.id} value={c.id}>{getCoachName(c)}</option>))}
                    </select>
                    {coaches.length === 0 && (
                      <p className="text-xs text-orange-500">{t('no_coaches_available')}</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" disabled={!assignStudent || !assignCoach || submitting} onClick={() => handleAssign(pkg.id)}>
                        {t('assign')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setAssignPkg(null); setAssignStudent(''); setAssignCoach(''); }}>
                        {t('cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 border-t">
                    <Button variant="outline" className="w-full mt-1" size="sm" onClick={() => setAssignPkg(pkg.id)}>
                      <Users className="h-3.5 w-3.5 me-1" />
                      {t('assign_to_student')}
                    </Button>

                    {/* ── Edit / Delete / Toggle Active ──────── */}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEditModal(pkg)}>
                        <Pencil className="h-3.5 w-3.5 me-1" />
                        {t('edit')}
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(pkg)}>
                        <Trash2 className="h-3.5 w-3.5 me-1" />
                        {t('delete')}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => handleToggleActive(pkg)}
                    >
                      {pkg.is_active ? t('status_active') : t('status_inactive')}
                      <span className={cn('ms-1.5 w-2 h-2 rounded-full', pkg.is_active ? 'bg-green-500' : 'bg-gray-400')} />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {packages.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">💪</div>
          <p className="text-gray-500">{t('no_packages_found')}</p>
        </div>
      )}
    </div>
  );
}
