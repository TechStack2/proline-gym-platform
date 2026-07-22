// ── Shared types & constants for the Leads module ──
import { statusTintClass } from '@/lib/status-vocabulary'
// Extracted from page.tsx so Next.js type generation doesn't fail on extra exports.

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'trial_scheduled'
  | 'trial_completed'
  | 'converted'
  | 'lost';

export type StatusFilter = 'all' | LeadStatus;

export interface Lead {
  id: string;
  gym_id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  source: string;
  source_detail?: string;
  interested_discipline_id?: string;
  interest_categories?: string[] | null; // MJ-5: landing "request to join" product interests
  notes?: string;
  status: LeadStatus;
  campaign_id?: string; // GRW-1 attribution
  assigned_to?: string;
  converted_student_id?: string;
  converted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Discipline {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
}

export interface GymCoach {
  id: string;
  first_name_ar: string;
  first_name_en: string;
  first_name_fr: string;
}

export interface MembershipPlan {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  duration_days: number;
  price_usd: number;
}

/** A scheduled trial surfaced on the lead card. */
export interface TrialInfo {
  id: string;
  lead_id: string;
  class_id: string | null;
  class_name: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  assigned_coach_id: string | null;
  status: 'scheduled' | 'completed' | 'no_show' | 'cancelled';
  show_up: boolean | null;
}

// TRIAL-SLOTS: an upcoming class occurrence for the trial picker (from occurrences.ts).
export type { ClassOccurrence, PtTrialSlot } from '@/lib/trials/occurrences';

/** Simulated login-invite state for a converted member. */
export interface InviteInfo {
  student_id: string;
  status: string;
  channel: string;
}

/** Lead source channels for the staff "Add Lead" form (DB CHECK on leads.source). */
export const LEAD_SOURCES = [
  'walk_in',
  'phone',
  'instagram',
  'facebook',
  'whatsapp',
  'referral',
  'website',
  'other',
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES: readonly LeadStatus[] = [
  'new',
  'contacted',
  'trial_scheduled',
  'trial_completed',
  'converted',
  'lost',
] as const;

export const COUNTABLE_STATUSES = [
  'new',
  'contacted',
  'trial_scheduled',
  'converted',
] as const;

// LEADS-BOUND: the lead LIST is capped at this many rows (the SSR fetch + the
// client search/filter re-fetch both apply it), so a gym with thousands of real
// leads doesn't load them all. The total is surfaced via the count query as
// "Showing N of TOTAL". A real load-more/pagination is a later polish.
export const LEADS_LIMIT = 50;

// W3b (DA-25/32): colour is the status vocabulary's call — these are the §2.3
// role tints (dark-correct), derived from the `lead` domain, not a local palette.
export const STATUS_COLORS: Record<LeadStatus, string> = {
  new: statusTintClass('lead', 'new'),
  contacted: statusTintClass('lead', 'contacted'),
  trial_scheduled: statusTintClass('lead', 'trial_scheduled'),
  trial_completed: statusTintClass('lead', 'trial_completed'),
  converted: statusTintClass('lead', 'converted'),
  lost: statusTintClass('lead', 'lost'),
};

export const SOURCE_ICONS: Record<string, string> = {
  instagram: '📷',
  facebook: '💬',
  whatsapp: '📱',
  website: '🌐',
  landing: '🚪', // MJ-5: the public landing "request to join" door
  phone: '📞',
  walk_in: '🚶',
  referral: '🤝',
  other: '📋',
};
