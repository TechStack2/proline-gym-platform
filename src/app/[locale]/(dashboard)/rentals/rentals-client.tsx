'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ModalPortal } from '@/components/shared/modal-portal';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Building, Calendar, Clock, DollarSign, FileText, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { rentalConflictCheckSchema } from '@/lib/validators/rentals.schema';
import { getLocalizedName } from '@/lib/i18n/helpers';

// ─── Local form schema (matches actual form fields) ───
const rentalBookingFormSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  time_from: z.string().min(1, 'Start time is required'),
  time_to: z.string().min(1, 'End time is required'),
  coach_name: z.string().min(1, 'Coach name is required'),
  coach_phone: z.string().min(1, 'Phone is required'),
}).refine(
  (data) => !data.time_to || !data.time_from || data.time_to > data.time_from,
  { message: 'End time must be after start time', path: ['time_to'] },
);

type RentalBookingFormValues = z.infer<typeof rentalBookingFormSchema>;

type RentalRow = {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  hourly_rate_usd: number;
  hourly_rate_lbp: number | null;
  max_capacity: number | null;
  status: string;
  description_ar: string | null;
  description_en: string | null;
  description_fr: string | null;
  gym_id: string;
  created_at: string;
  updated_at: string;
};

type BookingRow = {
  id: string;
  rental_id: string;
  start_time: string;
  end_time: string;
  external_coach_id: string;
  status: string;
  total_amount_usd: number;
  total_amount_lbp: number | null;
  notes_ar: string | null;
  notes_en: string | null;
  notes_fr: string | null;
  created_at: string;
  updated_at: string;
};

type Props = { rentals: RentalRow[]; bookings: BookingRow[]; locale: string };

const STATUS_STYLES: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  booked: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-orange-100 text-orange-700',
  retired: 'bg-gray-100 text-gray-600',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RentalsClient({ rentals: initialRentals, bookings, locale }: Props) {
  const t = useTranslations('rentals');
  const [rentals] = useState(initialRentals);
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookModal, setBookModal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showWaivers, setShowWaivers] = useState(false);
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<RentalBookingFormValues>({
    resolver: zodResolver(rentalBookingFormSchema),
    defaultValues: {
      date: '', time_from: '', time_to: '', coach_name: '', coach_phone: '',
    },
  });

  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    return d;
  });

  const handleBooking = async (data: RentalBookingFormValues) => {
    if (!bookModal) return;

    const startTime = `${data.date}T${data.time_from}:00`;
    const endTime = `${data.date}T${data.time_to}:00`;

    // Conflict check validation
    const conflictCheck = rentalConflictCheckSchema.safeParse({
      rental_id: bookModal,
      start_time: startTime,
      end_time: endTime,
    });
    if (!conflictCheck.success) {
      const firstIssue = conflictCheck.error.issues[0];
      toast.error(firstIssue?.message || t('validation_error'));
      return;
    }

    setSubmitting(true);
    try {
      // Look up external coach by phone from form; create if not found
      const selectedRental = rentals.find(r => r.id === bookModal);
      const gymId = selectedRental?.gym_id;
      let coachId: string | null = null;

      if (data.coach_phone && gymId) {
        const { data: existingCoach } = await supabase
          .from('external_coaches')
          .select('id')
          .eq('phone', data.coach_phone)
          .eq('gym_id', gymId)
          .maybeSingle();

        if (existingCoach) {
          coachId = existingCoach.id;
        } else {
          const { data: newCoach, error: createError } = await supabase
            .from('external_coaches')
            .insert({
              gym_id: gymId,
              first_name_en: data.coach_name,
              phone: data.coach_phone,
              is_active: true,
            })
            .select('id')
            .single();

          if (createError || !newCoach) {
            toast.error(t('booking_error'));
            setSubmitting(false);
            return;
          }
          coachId = newCoach.id;
        }
      }

      if (!coachId) {
        toast.error(t('booking_error'));
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from('rental_bookings').insert({
        rental_id: bookModal,
        external_coach_id: coachId,
        start_time: startTime,
        end_time: endTime,
        total_amount_usd: 0,
        status: 'confirmed',
      });

      if (error) {
        toast.error(t('booking_error'));
      } else {
        toast.success(t('booking_success'));
        setBookModal(null);
        reset();
      }
    } catch {
      toast.error(t('booking_error'));
    }
    setSubmitting(false);
  };

  const isBooked = (rentalId: string, date: Date) => {
    const ds = date.toISOString().split('T')[0];
    return bookings.some(b => b.rental_id === rentalId && b.start_time?.startsWith(ds));
  };

  return (
    <div className="space-y-6">
      {/* Weekly Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>
              {t('weekly_calendar')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} /></Button>
              <span className="text-sm font-medium text-gray-600">{weekDays[0].toLocaleDateString()} - {weekDays[6].toLocaleDateString()}</span>
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight className={cn('h-4 w-4', isRTL && 'rotate-180')} /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-start text-gray-400 font-medium w-32">{t('space')}</th>
                  {weekDays.map(d => (
                    <th key={d.toISOString()} className="p-2 text-center text-gray-400 font-medium">
                      <div>{DAYS[d.getDay()]}</div>
                      <div className="text-xs">{d.getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rentals.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 font-medium text-gray-700 text-xs">{getLocalizedName(r, locale)}</td>
                    {weekDays.map(d => {
                      const booked = isBooked(r.id, d);
                      return (
                        <td key={d.toISOString()} className="p-2 text-center">
                          <div className={cn('h-8 rounded-lg flex items-center justify-center text-xs', booked ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-300')}>
                            {booked ? '✓' : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Rentals Grid + Book Modal */}
      <div className="grid gap-4 md:grid-cols-3">
        {rentals.map(rental => (
          <Card key={rental.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center">
                  <Building className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <CardTitle className={cn('text-base', isRTL && 'font-arabic')}>{getLocalizedName(rental, locale)}</CardTitle>
                  <Badge className={cn('text-xs mt-0.5', STATUS_STYLES[rental.status] || 'bg-gray-100')}>{rental.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-lg font-bold text-primary-700"><DollarSign className="inline h-4 w-4" />${rental.hourly_rate_usd}<span className="text-sm font-normal text-gray-400">/{t('per_hour')}</span></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setBookModal(rental.id)}>
                  <Calendar className="h-3 w-3 me-1" />{t('book')}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowWaivers(!showWaivers)}>
                  <FileText className="h-3 w-3 me-1" />{t('waiver')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Booking Modal */}
      {bookModal && (
        <ModalPortal>
        <form onSubmit={handleSubmit(handleBooking)}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-bold">{t('new_booking')}</h3>
                <button type="button" onClick={() => { setBookModal(null); reset(); }} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-500">{t('date')}</label>
                  <input type="date" className="w-full px-3 py-2 text-sm border rounded-lg" {...register('date')} />
                  {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">{t('from')}</label>
                    <input type="time" className="w-full px-3 py-2 text-sm border rounded-lg" {...register('time_from')} />
                    {errors.time_from && <p className="text-red-500 text-xs mt-1">{errors.time_from.message}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{t('to')}</label>
                    <input type="time" className="w-full px-3 py-2 text-sm border rounded-lg" {...register('time_to')} />
                    {errors.time_to && <p className="text-red-500 text-xs mt-1">{errors.time_to.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t('coach_name')}</label>
                  <input className="w-full px-3 py-2 text-sm border rounded-lg" {...register('coach_name')} />
                  {errors.coach_name && <p className="text-red-500 text-xs mt-1">{errors.coach_name.message}</p>}
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t('phone')}</label>
                  <input className="w-full px-3 py-2 text-sm border rounded-lg" {...register('coach_phone')} />
                  {errors.coach_phone && <p className="text-red-500 text-xs mt-1">{errors.coach_phone.message}</p>}
                </div>
                <Button type="submit" disabled={submitting} className="w-full">{submitting ? '...' : t('confirm_booking')}</Button>
              </div>
            </div>
          </div>
        </form>
        </ModalPortal>
      )}

      {/* Waivers Section */}
      {showWaivers && (
        <Card>
          <CardHeader><CardTitle className={cn(isRTL && 'font-arabic')}>{t('waivers')}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-400 italic">{t('no_waivers')}</p>
          </CardContent>
        </Card>
      )}

      {rentals.length === 0 && (
        <div className="text-center py-16"><div className="text-4xl mb-3">🏢</div><p className="text-gray-500">{t('no_spaces')}</p></div>
      )}
    </div>
  );
}
