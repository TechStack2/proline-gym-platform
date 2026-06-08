'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tent, Users, Calendar, Clock, ChevronDown, ChevronUp, X,
  Pencil, Trash2, AlertTriangle,
} from 'lucide-react';
import { campInsertSchema } from '@/lib/validators/camps.schema';
import { getLocalizedName } from '@/lib/i18n/helpers';

// ─── Local form schema (strings for HTML inputs; validated+converted in handler) ───
const campFormSchema = z.object({
  name_ar: z.string().min(1, 'Name (AR) is required'),
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_fr: z.string(),
  description_ar: z.string(),
  description_en: z.string(),
  description_fr: z.string(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  max_capacity: z.string(),
  price_usd: z.string(),
  price_lbp: z.string(),
  min_age: z.string(),
  max_age: z.string(),
}).refine(
  (data) => !data.end_date || !data.start_date || data.end_date >= data.start_date,
  { message: 'End date must be after start date', path: ['end_date'] },
);

type CampFormValues = z.infer<typeof campFormSchema>;

// ─── Types ───────────────────────────────────────────────────────────
type CampRow = {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  description_ar?: string | null;
  description_en?: string | null;
  description_fr?: string | null;
  start_date: string;
  end_date: string;
  max_capacity: number;
  min_age?: number | null;
  max_age?: number | null;
  price_usd: number;
  price_lbp?: number | null;
  early_bird_price_usd?: number | null;
  early_bird_deadline?: string | null;
  sibling_discount_percent?: number | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  gym_id?: string;
};

type Props = {
  camps: CampRow[];
  locale: string;
  gymId: string;
};

// ─── Status constants ────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  open: 'bg-green-100 text-green-700 border-green-300',
  full: 'bg-orange-100 text-orange-700 border-orange-300',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-300',
  completed: 'bg-gray-100 text-gray-600 border-gray-300',
  cancelled: 'bg-red-100 text-red-700 border-red-300',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['open', 'cancelled'],
  open: ['full', 'in_progress', 'cancelled'],
  full: ['cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// ─── Helper ──────────────────────────────────────────────────────────
function getLocalizedCampName(camp: CampRow, locale: string): string {
  return getLocalizedName(camp, locale);
}

/** Convert form string values to the canonical insert payload, then validate */
function toInsertPayload(data: CampFormValues, gymId: string) {
  const canonical = {
    name_ar: data.name_ar || data.name_en,
    name_en: data.name_en,
    name_fr: data.name_fr || data.name_en,
    description_ar: data.description_ar || null,
    description_en: data.description_en || null,
    description_fr: data.description_fr || null,
    start_date: data.start_date,
    end_date: data.end_date,
    max_capacity: data.max_capacity ? parseInt(data.max_capacity, 10) : 1,
    price_usd: data.price_usd ? parseFloat(data.price_usd) : 0,
    price_lbp: data.price_lbp ? parseFloat(data.price_lbp) : null,
    gym_id: gymId,
    min_age: data.min_age ? parseInt(data.min_age, 10) : null,
    max_age: data.max_age ? parseInt(data.max_age, 10) : null,
  };
  return campInsertSchema.safeParse(canonical);
}

// ─── Component ───────────────────────────────────────────────────────
export function CampsClient({ camps: initialCamps, locale, gymId }: Props) {
  const t = useTranslations('camps');
  const [camps, setCamps] = useState(initialCamps);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<CampRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();
  const isRTL = locale === 'ar';

  // ── Create form ─────────────────────────────────────────────────
  const createForm = useForm<CampFormValues>({
    resolver: zodResolver(campFormSchema),
    defaultValues: {
      name_ar: '', name_en: '', name_fr: '',
      description_ar: '', description_en: '', description_fr: '',
      start_date: '', end_date: '',
      max_capacity: '', price_usd: '', price_lbp: '',
      min_age: '', max_age: '',
    },
  });

  // ── Edit form ───────────────────────────────────────────────────
  const editForm = useForm<CampFormValues>({
    resolver: zodResolver(campFormSchema),
    defaultValues: {
      name_ar: '', name_en: '', name_fr: '',
      description_ar: '', description_en: '', description_fr: '',
      start_date: '', end_date: '',
      max_capacity: '', price_usd: '', price_lbp: '',
      min_age: '', max_age: '',
    },
  });

  // ── CREATE handler ──────────────────────────────────────────────
  const handleCreate = async (data: CampFormValues) => {
    const parsed = toInsertPayload(data, gymId);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || t('validation_error'));
      return;
    }

    setSubmitting(true);
    try {
      const { data: created, error } = await supabase
        .from('camps')
        .insert(parsed.data)
        .select()
        .single();

      if (error) throw error;

      setCamps((prev) => [...prev, created as CampRow]);
      setShowCreate(false);
      createForm.reset();
      toast.success(t('toast.created'));
    } catch (err: any) {
      toast.error(err?.message || t('toast.create_error'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── EDIT handler ────────────────────────────────────────────────
  const openEditModal = (camp: CampRow) => {
    setEditTarget(camp);
    editForm.reset({
      name_ar: camp.name_ar || '',
      name_en: camp.name_en || '',
      name_fr: camp.name_fr || '',
      description_ar: camp.description_ar || '',
      description_en: camp.description_en || '',
      description_fr: camp.description_fr || '',
      start_date: camp.start_date,
      end_date: camp.end_date,
      max_capacity: String(camp.max_capacity),
      price_usd: String(camp.price_usd),
      price_lbp: camp.price_lbp != null ? String(camp.price_lbp) : '',
      min_age: camp.min_age != null ? String(camp.min_age) : '',
      max_age: camp.max_age != null ? String(camp.max_age) : '',
    });
  };

  const handleEdit = async (data: CampFormValues) => {
    if (!editTarget) return;

    const parsed = toInsertPayload(data, gymId);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || t('validation_error'));
      return;
    }

    setSubmitting(true);
    try {
      const { data: updated, error } = await supabase
        .from('camps')
        .update(parsed.data)
        .eq('id', editTarget.id)
        .eq('gym_id', gymId)
        .select()
        .single();

      if (error) throw error;

      setCamps((prev) =>
        prev.map((c) => (c.id === editTarget.id ? { ...c, ...(updated as CampRow) } : c)),
      );
      setEditTarget(null);
      toast.success(t('toast.updated'));
    } catch (err: any) {
      toast.error(err?.message || t('toast.update_error'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── DELETE handler (soft-delete) ────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('camps')
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', deleteTarget.id)
        .eq('gym_id', gymId);

      if (error) throw error;

      setCamps((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      setExpandedId(null);
      toast.success(t('toast.deleted'));
    } catch (err: any) {
      toast.error(err?.message || t('toast.delete_error'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── STATUS change handler ───────────────────────────────────────
  const handleStatusChange = async (camp: CampRow, newStatus: string) => {
    const previousCamps = [...camps];
    setCamps((prev) =>
      prev.map((c) => (c.id === camp.id ? { ...c, status: newStatus } : c)),
    );

    try {
      const { error } = await supabase
        .from('camps')
        .update({ status: newStatus } as any)
        .eq('id', camp.id)
        .eq('gym_id', gymId);

      if (error) throw error;
      toast.success(t('toast.status_updated'));
    } catch (err: any) {
      setCamps(previousCamps);
      toast.error(err?.message || t('toast.status_error'));
    }
  };

  // ── Shared form fields renderer ─────────────────────────────────
  const renderFormFields = (reg: any, errs: Record<string, any>) => (
    <>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('name_en_placeholder')} {...reg('name_en')} />
        {errs.name_en && <p className="text-red-500 text-xs mt-1">{errs.name_en.message as string}</p>}
      </div>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('name_ar_placeholder')} {...reg('name_ar')} />
        {errs.name_ar && <p className="text-red-500 text-xs mt-1">{errs.name_ar.message as string}</p>}
      </div>
      <div>
        <input className="w-full px-3 py-2 text-sm border rounded-lg" placeholder={t('name_fr_placeholder')} {...reg('name_fr')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">{t('start_date')}</label>
          <input type="date" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('start_date')} />
          {errs.start_date && <p className="text-red-500 text-xs mt-1">{errs.start_date.message as string}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('end_date')}</label>
          <input type="date" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('end_date')} />
          {errs.end_date && <p className="text-red-500 text-xs mt-1">{errs.end_date.message as string}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">{t('capacity')}</label>
          <input type="number" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('max_capacity')} />
          {errs.max_capacity && <p className="text-red-500 text-xs mt-1">{errs.max_capacity.message as string}</p>}
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
          <label className="text-xs text-gray-500">{t('min_age')}</label>
          <input type="number" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('min_age')} />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">{t('max_age')}</label>
        <input type="number" className="w-full px-3 py-2 text-sm border rounded-lg" {...reg('max_age')} />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t('description_en_placeholder')}</label>
        <textarea className="w-full px-3 py-2 text-sm border rounded-lg" rows={2} {...reg('description_en')} />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t('description_ar_placeholder')}</label>
        <textarea className="w-full px-3 py-2 text-sm border rounded-lg" rows={2} {...reg('description_ar')} />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t('description_fr_placeholder')}</label>
        <textarea className="w-full px-3 py-2 text-sm border rounded-lg" rows={2} {...reg('description_fr')} />
      </div>
    </>
  );

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Tent className="h-4 w-4 mr-1.5" />
          {t('new_camp')}
        </Button>
      </div>

      {/* ── CREATE Form Modal ─────────────────────────────────── */}
      {showCreate && (
        <form onSubmit={createForm.handleSubmit(handleCreate)}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-bold">{t('new_camp')}</h3>
                <button type="button" onClick={() => { setShowCreate(false); createForm.reset(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {renderFormFields(createForm.register, createForm.formState.errors)}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? '...' : t('create')}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── EDIT Form Modal ───────────────────────────────────── */}
      {editTarget && (
        <form onSubmit={editForm.handleSubmit(handleEdit)}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-bold">{t('edit_camp')}</h3>
                <button type="button" onClick={() => setEditTarget(null)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {renderFormFields(editForm.register, editForm.formState.errors)}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? '...' : t('save_changes')}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── DELETE Confirmation Modal ─────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
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
        </div>
      )}

      {/* ── Camp Cards ────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {camps.map((camp) => {
          const isExpanded = expandedId === camp.id;
          const availableTransitions = STATUS_TRANSITIONS[camp.status] || [];

          return (
            <Card key={camp.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>
                    {getLocalizedCampName(camp, locale)}
                  </CardTitle>
                  <div className="relative group">
                    <Badge className={cn('cursor-pointer border', STATUS_STYLES[camp.status] || 'bg-gray-100')}>
                      {t(`status.${camp.status}`)}
                    </Badge>
                    {availableTransitions.length > 0 && (
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[140px] hidden group-hover:block">
                        {availableTransitions.map((next) => (
                          <button
                            key={next}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
                            onClick={() => handleStatusChange(camp, next)}
                          >
                            <span className={cn('w-2 h-2 rounded-full', {
                              'bg-green-500': next === 'open',
                              'bg-blue-500': next === 'in_progress',
                              'bg-orange-500': next === 'full',
                              'bg-gray-400': next === 'completed',
                              'bg-red-500': next === 'cancelled',
                            })} />
                            {t(`status.${next}`)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <span>
                      {new Date(camp.start_date).toLocaleDateString()} - {new Date(camp.end_date).toLocaleDateString()}
                    </span>
                  </div>
                  {(camp.min_age != null && camp.max_age != null) && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span>{t('ages', { min: camp.min_age, max: camp.max_age })}</span>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="pt-3 border-t space-y-2">
                    {camp.description_en && (
                      <p className="text-sm text-gray-600">
                        {t('description')}: {getLocalizedName({ name_ar: camp.description_ar, name_en: camp.description_en, name_fr: camp.description_fr }, locale)}
                      </p>
                    )}
                    {camp.price_usd != null && (
                      <p className="text-sm font-medium">
                        {t('price_usd')}: ${camp.price_usd}{camp.price_lbp != null && ` / ${camp.price_lbp.toLocaleString()} LBP`}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {camp.max_capacity
                          ? `${t('capacity')}: ${camp.max_capacity}`
                          : t('unlimited')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => openEditModal(camp)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        {t('edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteTarget(camp)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {t('delete')}
                      </Button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setExpandedId(isExpanded ? null : camp.id)}
                  className="w-full flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {isExpanded ? t('less') : t('more')}
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {camps.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏕️</div>
          <p className="text-gray-500">{t('no_camps')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('no_camps_hint')}</p>
        </div>
      )}
    </div>
  );
}
