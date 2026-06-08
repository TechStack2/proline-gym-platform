import { z } from 'zod';

// ─── Membership Type Enum ──────────────────────────────────────────
export const MEMBERSHIP_TYPE_VALUES = ['monthly', 'quarterly', 'annual'] as const;
export const membershipTypeEnum = z.enum(MEMBERSHIP_TYPE_VALUES);

// ─── Membership Status Enum ────────────────────────────────────────
export const MEMBERSHIP_STATUS_VALUES = ['active', 'frozen', 'cancelled'] as const;
export const membershipStatusEnum = z.enum(MEMBERSHIP_STATUS_VALUES);

// ─── Membership Insert Schema ──────────────────────────────────────
export const membershipInsertSchema = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  membership_type: membershipTypeEnum,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  price: z.number().positive('Price must be a positive number'),
  status: membershipStatusEnum,
}).refine(
  (data) => data.end_date > data.start_date,
  {
    message: 'End date must be after start date',
    path: ['end_date'],
  },
);

export type MembershipInsert = z.infer<typeof membershipInsertSchema>;

// ─── Membership Update Schema ──────────────────────────────────────
// Defined independently (not derived from membershipInsertSchema.partial())
// because Zod does not allow .partial() on schemas with .refine()
export const membershipUpdateSchema = z.object({
  student_id: z.string().uuid('Invalid student ID').optional(),
  membership_type: membershipTypeEnum.optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  price: z.number().positive('Price must be a positive number').optional(),
  status: membershipStatusEnum.optional(),
  id: z.string().uuid('Invalid membership ID'),
});

export type MembershipUpdate = z.infer<typeof membershipUpdateSchema>;
