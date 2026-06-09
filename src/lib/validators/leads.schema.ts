import { z } from 'zod';
import type { LeadStatus } from '@/app/[locale]/(dashboard)/leads/leads-types';

// Re-export the LeadStatus values from the shared types module
export { type LeadStatus };

// ─── Lead Insert Schema ────────────────────────────────────────────
export const leadInsertSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  source: z.string().min(1, 'Source is required'),
  // Optional: a walk-in / phone enquiry may not have picked a discipline yet.
  discipline_id: z.string().uuid('Invalid discipline ID').optional().or(z.literal('')),
  notes: z.string().optional(),
});

export type LeadInsert = z.infer<typeof leadInsertSchema>;

// ─── Lead Status Values (synced with leads-types.ts) ──────────────
export const LEAD_STATUS_VALUES = [
  'new',
  'contacted',
  'trial_scheduled',
  'trial_completed',
  'converted',
  'lost',
] as const;

export const leadStatusEnum = z.enum(LEAD_STATUS_VALUES);

// ─── Lead Update Schema (partial update) ──────────────────────────
export const leadUpdateSchema = z.object({
  id: z.string().uuid('Invalid lead ID'),
  status: leadStatusEnum.optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  source: z.string().min(1).optional(),
  discipline_id: z.string().uuid('Invalid discipline ID').optional(),
  notes: z.string().optional(),
  assigned_to: z.string().uuid('Invalid assignee ID').optional(),
});

export type LeadUpdate = z.infer<typeof leadUpdateSchema>;

// ─── Lead Status Transition Schema ─────────────────────────────────
export const leadStatusUpdateSchema = z.object({
  id: z.string().uuid('Invalid lead ID'),
  status: leadStatusEnum,
  notes: z.string().optional(),
  converted_at: z.string().datetime().optional(),
}).refine(
  (data) => {
    // converted_at is required when status is 'converted'
    if (data.status === 'converted' && !data.converted_at) {
      return false;
    }
    return true;
  },
  {
    message: 'converted_at is required when status is "converted"',
    path: ['converted_at'],
  },
);

export type LeadStatusUpdate = z.infer<typeof leadStatusUpdateSchema>;
