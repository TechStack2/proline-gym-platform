// ── Supabase Database Types Helpers ──
// Re-export the full Database type from the auto-generated types
export type { Database, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes, Constants } from './database';

import type { Database } from './database';

// ── Generic Row/Insert/Update helpers (simpler aliases) ──
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// ── Domain-Specific Type Aliases ──
export type Lead = TableRow<'leads'>;
export type Student = TableRow<'students'>;
export type BeltPromotion = TableRow<'belt_promotions'>;
export type BeltHierarchy = TableRow<'belt_hierarchies'>;
export type Camp = TableRow<'camps'>;
export type CampRegistration = TableRow<'camp_registrations'>;
export type PtPackage = TableRow<'pt_packages'>;
export type PtAssignment = TableRow<'pt_assignments'>;
export type PtSession = TableRow<'pt_sessions'>;
export type Rental = TableRow<'rentals'>;
export type RentalBooking = TableRow<'rental_bookings'>;
export type StudentMembership = TableRow<'student_memberships'>;
export type MembershipPlan = TableRow<'membership_plans'>;
export type Profile = TableRow<'profiles'>;
export type Gym = TableRow<'gyms'>;
export type Discipline = TableRow<'disciplines'>;
export type Coach = TableRow<'coaches'>;
export type Class = TableRow<'classes'>;
export type ClassSchedule = TableRow<'class_schedules'>;
export type AttendanceRecord = TableRow<'attendance_records'>;
export type Payment = TableRow<'payments'>;
export type Invoice = TableRow<'invoices'>;
export type ExternalCoach = TableRow<'external_coaches'>;
export type TrialClass = TableRow<'trial_classes'>;
export type UserRole = TableRow<'user_roles'>;
export type Guardian = TableRow<'guardians'>;
export type Document = TableRow<'documents'>;
export type MessageLog = TableRow<'message_logs'>;
export type Notification = TableRow<'notifications'>;
export type AuditLog = TableRow<'audit_logs'>;
export type ExchangeRate = TableRow<'exchange_rates'>;

// ── Composite Profile Types (Profile + Student/Coach join) ──
export interface StudentProfile {
  id: string;
  first_name_ar: string | null;
  first_name_en: string | null;
  first_name_fr: string | null;
  last_name_ar: string | null;
  last_name_en: string | null;
  last_name_fr: string | null;
  phone: string | null;
  gender: Database['public']['Enums']['gender_enum'] | null;
  date_of_birth: string | null;
  avatar_url: string | null;
  locale: string | null;
  is_active: boolean;
}

export interface CoachProfile {
  id: string;
  first_name_ar: string | null;
  first_name_en: string | null;
  first_name_fr: string | null;
  last_name_ar: string | null;
  last_name_en: string | null;
  last_name_fr: string | null;
  phone: string | null;
  avatar_url: string | null;
  locale: string | null;
}

// ── Enums (re-exported for convenience) ──
export type BeltRank = Database['public']['Enums']['belt_rank_enum'];
export type LeadStatus = Database['public']['Enums']['lead_status_enum'];
export type CampStatus = Database['public']['Enums']['camp_status_enum'];
export type PaymentStatus = Database['public']['Enums']['payment_status_enum'];
export type MembershipStatus = Database['public']['Enums']['membership_status_enum'];
export type RentalStatus = Database['public']['Enums']['rental_status_enum'];
export type BookingStatus = Database['public']['Enums']['booking_status_enum'];
export type PtSessionStatus = Database['public']['Enums']['pt_session_status_enum'];
export type GenderEnum = Database['public']['Enums']['gender_enum'];
export type UserRoleEnum = Database['public']['Enums']['user_role_enum'];
export type PaymentMethodEnum = Database['public']['Enums']['payment_method_enum'];
export type InvoiceTypeEnum = Database['public']['Enums']['invoice_type_enum'];
export type ClassStatusEnum = Database['public']['Enums']['class_status_enum'];
export type AttendanceStatusEnum = Database['public']['Enums']['attendance_status_enum'];
