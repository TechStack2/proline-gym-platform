import { z } from 'zod';

// ─── Camp Insert Schema ────────────────────────────────────────────
// Matches actual DB columns from src/types/database.ts `camps` table
export const campInsertSchema = z.object({
  name_ar: z.string().min(1, 'Camp name (AR) is required'),
  name_en: z.string().min(1, 'Camp name (EN) is required'),
  name_fr: z.string().optional().default(''),
  description_ar: z.string().optional().nullable(),
  description_en: z.string().optional().nullable(),
  description_fr: z.string().optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  max_capacity: z.number().int().positive('Capacity must be a positive integer'),
  price_usd: z.number().positive('Price USD must be a positive number'),
  price_lbp: z.number().positive('Price LBP must be a positive number').optional().nullable(),
  gym_id: z.string().uuid('Invalid gym ID'),
  min_age: z.number().int().positive().optional().nullable(),
  max_age: z.number().int().positive().optional().nullable(),
  early_bird_price_usd: z.number().positive().optional().nullable(),
  early_bird_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  sibling_discount_percent: z.number().min(0).max(100).optional().nullable(),
}).refine(
  (data) => data.end_date >= data.start_date,
  {
    message: 'End date must be after start date',
    path: ['end_date'],
  },
);

export type CampInsert = z.infer<typeof campInsertSchema>;

// ─── Camp Update Schema ────────────────────────────────────────────
// Defined independently (not derived from campInsertSchema.partial())
// because Zod does not allow .partial() on schemas with .refine()
export const campUpdateSchema = z.object({
  name_ar: z.string().min(1, 'Camp name (AR) is required').optional(),
  name_en: z.string().min(1, 'Camp name (EN) is required').optional(),
  name_fr: z.string().optional().default(''),
  description_ar: z.string().optional().nullable(),
  description_en: z.string().optional().nullable(),
  description_fr: z.string().optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  max_capacity: z.number().int().positive('Capacity must be a positive integer').optional(),
  price_usd: z.number().positive('Price USD must be a positive number').optional(),
  price_lbp: z.number().positive('Price LBP must be a positive number').optional().nullable(),
  gym_id: z.string().uuid('Invalid gym ID').optional(),
  min_age: z.number().int().positive().optional().nullable(),
  max_age: z.number().int().positive().optional().nullable(),
  early_bird_price_usd: z.number().positive().optional().nullable(),
  early_bird_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  sibling_discount_percent: z.number().min(0).max(100).optional().nullable(),
  id: z.string().uuid('Invalid camp ID'),
});

export type CampUpdate = z.infer<typeof campUpdateSchema>;

// ─── Camp Form Schema (for react-hook-form — all fields are strings) ───
// HTML <input> elements always produce strings; numeric conversion
// happens in the submit handler before validating with campInsertSchema
export const campFormSchema = z.object({
  name_ar: z.string().min(1, 'Name (AR) is required'),
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_fr: z.string().default(''),
  description_ar: z.string().default(''),
  description_en: z.string().default(''),
  description_fr: z.string().default(''),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  max_capacity: z.string().min(1, 'Capacity is required'),
  price_usd: z.string().min(1, 'Price USD is required'),
  price_lbp: z.string().optional().default(''),
  min_age: z.string().optional().default(''),
  max_age: z.string().optional().default(''),
}).refine(
  (data) => !data.end_date || !data.start_date || data.end_date >= data.start_date,
  { message: 'End date must be after start date', path: ['end_date'] },
);

export type CampFormValues = z.infer<typeof campFormSchema>;

// ─── Camp Registration Schema ──────────────────────────────────────
// Matches actual DB columns from src/types/database.ts `camp_registrations` table
// DB CHECK constraint: status IN ('pending', 'confirmed', 'cancelled', 'waitlisted')
// DB DEFAULT: 'confirmed'
export const campRegistrationSchema = z.object({
  camp_id: z.string().uuid('Invalid camp ID'),
  student_id: z.string().uuid('Invalid student ID'),
  registration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'waitlisted']).optional().default('confirmed'),
  dietary_restrictions: z.string().optional().nullable(),
  medical_notes: z.string().optional().nullable(),
  guardian_id: z.string().uuid().optional().nullable(),
  pickup_authorized_persons: z.string().optional().nullable(),
});

export type CampRegistration = z.infer<typeof campRegistrationSchema>;
