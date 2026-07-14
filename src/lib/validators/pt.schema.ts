import { z } from 'zod';

// ─── PT Package Insert Schema ──────────────────────────────────────
// Matches actual DB columns from src/types/database.ts `pt_packages` table
export const ptPackageInsertSchema = z.object({
  name_ar: z.string().min(1, 'Package name (AR) is required'),
  name_en: z.string().min(1, 'Package name (EN) is required'),
  name_fr: z.string().optional().default(''),
  description_ar: z.string().optional().nullable(),
  description_en: z.string().optional().nullable(),
  description_fr: z.string().optional().nullable(),
  session_count: z.number().int().positive('Session count must be a positive integer'),
  // BILL-GUARDS R1: 0 = explicitly free (the "Free" chip) → nonnegative, not positive.
  price_usd: z.number().nonnegative('Price USD must be zero or a positive number'),
  price_lbp: z.number().nonnegative('Price LBP must be zero or a positive number').optional().nullable(),
  gym_id: z.string().uuid('Invalid gym ID'),
  coach_id: z.string().uuid('Invalid coach ID').optional().nullable(),
  validity_days: z.number().int().positive().optional().nullable(),
});

export type PtPackageInsert = z.infer<typeof ptPackageInsertSchema>;

// ─── PT Package Update Schema ──────────────────────────────────────
export const ptPackageUpdateSchema = ptPackageInsertSchema.partial().extend({
  id: z.string().uuid('Invalid package ID'),
});

export type PtPackageUpdate = z.infer<typeof ptPackageUpdateSchema>;

// ─── PT Session Booking Schema ─────────────────────────────────────
// Matches actual DB columns from src/types/database.ts `pt_sessions` table
export const ptSessionBookingSchema = z.object({
  package_id: z.string().uuid('Invalid package ID').optional().nullable(),
  student_id: z.string().uuid('Invalid student ID'),
  coach_id: z.string().uuid('Invalid coach ID'),
  scheduled_at: z.string().datetime({ message: 'Invalid scheduled datetime (ISO 8601)' }),
  duration_minutes: z.number().int().positive('Duration must be a positive integer (minutes)').optional().default(60),
  status: z.string().optional().default('scheduled'),
  notes_ar: z.string().optional().nullable(),
  notes_en: z.string().optional().nullable(),
  notes_fr: z.string().optional().nullable(),
});

export type PtSessionBooking = z.infer<typeof ptSessionBookingSchema>;

// ─── PT Assignment Insert Schema (credit tracking) ─────────────────
export const ptAssignmentInsertSchema = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  package_id: z.string().uuid('Invalid package ID'),
  coach_id: z.string().uuid('Invalid coach ID'),
  sessions_total: z.number().int().positive('Sessions total must be positive'),
  sessions_used: z.number().int().min(0).optional().default(0),
  purchased_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export type PtAssignmentInsert = z.infer<typeof ptAssignmentInsertSchema>;

// ─── PT Assignment Update Schema ───────────────────────────────────
export const ptAssignmentUpdateSchema = ptAssignmentInsertSchema.partial().extend({
  id: z.string().uuid('Invalid assignment ID'),
});

export type PtAssignmentUpdate = z.infer<typeof ptAssignmentUpdateSchema>;
