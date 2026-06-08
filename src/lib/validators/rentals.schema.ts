import { z } from 'zod';

// ─── Rental Insert Schema ──────────────────────────────────────────
// Matches actual DB columns from src/types/database.ts `rentals` table
export const rentalInsertSchema = z.object({
  name_ar: z.string().min(1, 'Rental space name (AR) is required'),
  name_en: z.string().min(1, 'Rental space name (EN) is required'),
  name_fr: z.string().optional().default(''),
  description_ar: z.string().optional().nullable(),
  description_en: z.string().optional().nullable(),
  description_fr: z.string().optional().nullable(),
  hourly_rate_usd: z.number().positive('Hourly rate USD must be a positive number'),
  hourly_rate_lbp: z.number().positive('Hourly rate LBP must be a positive number').optional().nullable(),
  max_capacity: z.number().int().positive('Capacity must be a positive integer').optional().nullable(),
  gym_id: z.string().uuid('Invalid gym ID'),
});

export type RentalInsert = z.infer<typeof rentalInsertSchema>;

// ─── Rental Update Schema ──────────────────────────────────────────
export const rentalUpdateSchema = rentalInsertSchema.partial().extend({
  id: z.string().uuid('Invalid rental ID'),
});

export type RentalUpdate = z.infer<typeof rentalUpdateSchema>;

// ─── Rental Booking Schema ─────────────────────────────────────────
// Matches actual DB columns from src/types/database.ts `rental_bookings` table
export const rentalBookingSchema = z.object({
  rental_id: z.string().uuid('Invalid rental ID'),
  external_coach_id: z.string().uuid('Invalid external coach ID'),
  start_time: z.string().datetime({ message: 'Invalid start datetime (ISO 8601)' }),
  end_time: z.string().datetime({ message: 'Invalid end datetime (ISO 8601)' }),
  total_amount_usd: z.number().positive('Total amount USD must be a positive number'),
  total_amount_lbp: z.number().positive('Total amount LBP must be a positive number').optional().nullable(),
  notes_ar: z.string().optional().nullable(),
  notes_en: z.string().optional().nullable(),
  notes_fr: z.string().optional().nullable(),
}).refine(
  (data) => data.end_time > data.start_time,
  {
    message: 'End datetime must be after start datetime',
    path: ['end_time'],
  },
);

export type RentalBooking = z.infer<typeof rentalBookingSchema>;

// ─── Rental Conflict Check Schema ──────────────────────────────────
export const rentalConflictCheckSchema = z.object({
  rental_id: z.string().uuid('Invalid rental ID'),
  start_time: z.string().datetime({ message: 'Invalid start datetime (ISO 8601)' }),
  end_time: z.string().datetime({ message: 'Invalid end datetime (ISO 8601)' }),
}).refine(
  (data) => data.end_time > data.start_time,
  {
    message: 'End datetime must be after start datetime',
    path: ['end_time'],
  },
);

export type RentalConflictCheck = z.infer<typeof rentalConflictCheckSchema>;
