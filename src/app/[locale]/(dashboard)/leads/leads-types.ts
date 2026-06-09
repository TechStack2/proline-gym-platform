// ── Shared types & constants for the Leads module ──
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
  notes?: string;
  status: LeadStatus;
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
  scheduled_date: string;
  scheduled_time: string | null;
  assigned_coach_id: string | null;
  status: 'scheduled' | 'completed' | 'no_show' | 'cancelled';
  show_up: boolean | null;
}

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

export const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  trial_scheduled: 'bg-purple-100 text-purple-700',
  trial_completed: 'bg-indigo-100 text-indigo-700',
  converted: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

export const SOURCE_ICONS: Record<string, string> = {
  instagram: '📷',
  facebook: '💬',
  whatsapp: '📱',
  website: '🌐',
  phone: '📞',
  walk_in: '🚶',
  referral: '🤝',
  other: '📋',
};
