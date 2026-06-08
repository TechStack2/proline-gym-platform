import { z } from 'zod';

// ─── Gender enum ───────────────────────────────────────────────────
export const GENDER_VALUES = ['male', 'female', 'other'] as const;
export const genderEnum = z.enum(GENDER_VALUES);

// ─── Student Insert Schema ─────────────────────────────────────────
export const studentInsertSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  gender: genderEnum.optional(),
  gym_id: z.string().uuid('Invalid gym ID'),
  current_belt_rank: z.string().optional(),
});

export type StudentInsert = z.infer<typeof studentInsertSchema>;

// ─── Student Update Schema ─────────────────────────────────────────
export const studentUpdateSchema = studentInsertSchema.partial().extend({
  id: z.string().uuid('Invalid student ID'),
});

export type StudentUpdate = z.infer<typeof studentUpdateSchema>;
