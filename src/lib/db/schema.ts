// ============================================================
// D1: Dexie.js IndexedDB Schema
// Mirror of critical PostgreSQL tables for offline operations
// PRO LINE Gym Platform — Phase D Offline Sync & PWA
// ============================================================

import Dexie, { type Table } from 'dexie';

// ─── TypeScript Interfaces (mirror PG columns) ─────────────────────

export interface OfflineGym {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  slug: string;
  address_ar?: string;
  address_en?: string;
  address_fr?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  timezone?: string;
  currency_preference: 'USD' | 'LBP' | 'BOTH';
  logo_url?: string;
  is_active: boolean;
  updated_at: string; // ISO 8601
}

export interface OfflineProfile {
  id: string; // matches auth.users(id)
  gym_id: string;
  first_name_ar?: string;
  first_name_en?: string;
  first_name_fr?: string;
  last_name_ar?: string;
  last_name_en?: string;
  last_name_fr?: string;
  phone?: string;
  gender?: 'male' | 'female' | 'other';
  date_of_birth?: string;
  avatar_url?: string;
  locale?: 'ar' | 'en' | 'fr';
  is_active: boolean;
  updated_at: string;
}

export interface OfflineStudent {
  id: string;
  profile_id: string;
  gym_id: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  medical_notes?: string;
  join_date: string;
  is_active: boolean;
  updated_at: string;
  // Denormalized for offline display
  profile_name_ar?: string;
  profile_name_en?: string;
  profile_phone?: string;
}

export interface OfflineCoach {
  id: string;
  profile_id: string;
  gym_id: string;
  specialization_ar?: string;
  specialization_en?: string;
  specialization_fr?: string;
  bio_ar?: string;
  bio_en?: string;
  bio_fr?: string;
  belt_rank?: string;
  hourly_rate_usd?: number;
  hourly_rate_lbp?: number;
  is_active: boolean;
  updated_at: string;
  profile_name_ar?: string;
  profile_name_en?: string;
}

export interface OfflineDiscipline {
  id: string;
  gym_id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  description_ar?: string;
  description_en?: string;
  description_fr?: string;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
}

export interface OfflineBeltHierarchy {
  id: string;
  discipline_id: string;
  rank: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  sort_order: number;
  stripe_count: number;
  min_months_in_rank?: number;
  min_classes_attended?: number;
  is_black_belt: boolean;
}

export interface OfflineBeltPromotion {
  id: string;
  student_id: string;
  coach_id: string;
  discipline_id: string;
  belt_hierarchy_id: string;
  from_rank?: string;
  to_rank: string;
  promotion_date: string;
  notes_ar?: string;
  notes_en?: string;
  notes_fr?: string;
  updated_at: string;
}

export interface OfflineClass {
  id: string;
  gym_id: string;
  discipline_id: string;
  coach_id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  description_ar?: string;
  description_en?: string;
  description_fr?: string;
  room?: string;
  max_capacity: number;
  min_age?: number;
  max_age?: number;
  belt_requirement?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  color?: string;
  is_active: boolean;
  updated_at: string;
  // Denormalized
  discipline_name_ar?: string;
  discipline_name_en?: string;
  coach_name_ar?: string;
  coach_name_en?: string;
}

export interface OfflineClassSchedule {
  id: string;
  class_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  is_active: boolean;
  valid_from?: string;
  valid_until?: string;
  updated_at: string;
}

export interface OfflineClassEnrollment {
  id: string;
  class_id: string;
  student_id: string;
  enrolled_at: string;
  is_active: boolean;
}

export interface OfflineAttendanceRecord {
  id: string;
  class_id: string;
  student_id: string;
  schedule_id?: string;
  marked_by?: string;
  attendance_date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late' | 'excused';
  check_in_time?: string;
  notes_ar?: string;
  notes_en?: string;
  notes_fr?: string;
  offline_sync_id?: string;
  updated_at: string;
  // Denormalized for offline display
  student_name_ar?: string;
  student_name_en?: string;
  class_name_ar?: string;
  class_name_en?: string;
  // Sync state
  _is_dirty?: boolean;
  _sync_status?: 'pending' | 'synced' | 'conflict';
}

export interface OfflineMembershipPlan {
  id: string;
  gym_id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  description_ar?: string;
  description_en?: string;
  description_fr?: string;
  duration_days: number;
  price_usd: number;
  price_lbp?: number;
  max_classes_per_week?: number;
  includes_pt: boolean;
  is_active: boolean;
  updated_at: string;
}

export interface OfflineStudentMembership {
  id: string;
  student_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled' | 'paused' | 'pending';
  pause_start_date?: string;
  pause_end_date?: string;
  auto_renew: boolean;
  updated_at: string;
}

export interface OfflineInvoice {
  id: string;
  gym_id: string;
  student_id: string;
  membership_id?: string;
  invoice_type: string;
  invoice_number: string;
  amount_usd: number;
  amount_lbp: number;
  exchange_rate?: number;
  rate_date?: string;
  tax_rate: number;
  tax_amount_usd: number;
  total_usd: number;
  total_lbp?: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded' | 'partial';
  due_date: string;
  paid_at?: string;
  notes_ar?: string;
  notes_en?: string;
  notes_fr?: string;
  updated_at: string;
  student_name_ar?: string;
  student_name_en?: string;
}

export interface OfflinePayment {
  id: string;
  invoice_id: string;
  student_id: string;
  received_by?: string;
  amount_usd: number;
  amount_lbp: number;
  exchange_rate?: number;
  rate_date?: string;
  payment_method: string;
  payment_date: string;
  reference_number?: string;
  notes_ar?: string;
  notes_en?: string;
  notes_fr?: string;
  updated_at: string;
  _is_dirty?: boolean;
  _sync_status?: 'pending' | 'synced' | 'conflict';
}

export interface OfflinePtPackage {
  id: string;
  gym_id: string;
  coach_id?: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  description_ar?: string;
  description_en?: string;
  description_fr?: string;
  session_count: number;
  price_usd: number;
  price_lbp?: number;
  validity_days?: number;
  is_active: boolean;
  updated_at: string;
}

export interface OfflinePtAssignment {
  id: string;
  student_id: string;
  package_id: string;
  coach_id: string;
  sessions_total: number;
  sessions_used: number;
  sessions_remaining: number;
  purchased_at: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfflinePtSession {
  id: string;
  student_id: string;
  coach_id: string;
  package_id?: string;
  scheduled_at: string;
  duration_minutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notes_ar?: string;
  notes_en?: string;
  notes_fr?: string;
  updated_at: string;
  student_name_ar?: string;
  student_name_en?: string;
  coach_name_ar?: string;
  coach_name_en?: string;
}

export interface OfflineLead {
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
  status: string;
  assigned_to?: string;
  converted_student_id?: string;
  converted_at?: string;
  updated_at: string;
}

export interface OfflineCamp {
  id: string;
  gym_id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  description_ar?: string;
  description_en?: string;
  description_fr?: string;
  start_date: string;
  end_date: string;
  min_age?: number;
  max_age?: number;
  max_capacity: number;
  price_usd: number;
  price_lbp?: number;
  early_bird_price_usd?: number;
  early_bird_deadline?: string;
  sibling_discount_percent?: number;
  status: string;
  updated_at: string;
}

export interface OfflineCampRegistration {
  id: string;
  camp_id: string;
  student_id: string;
  guardian_id?: string;
  pickup_authorized_persons?: string;
  medical_notes?: string;
  dietary_restrictions?: string;
  invoice_id?: string;
  registration_date: string;
  status: string;
  updated_at: string;
}

// ─── Sync Infrastructure Tables ─────────────────────────────────────

export type SyncOperation = 'insert' | 'update' | 'delete';

export interface SyncQueueItem {
  id?: number; // auto-increment
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: Record<string, unknown>; // the full record snapshot
  created_at: string; // ISO 8601
  retry_count: number;
  last_error?: string;
}

export interface SyncMetadata {
  table_name: string; // primary key
  last_synced_at: string; // ISO 8601
  last_cursor?: string; // for cursor-based pagination
  record_count: number;
}

// ─── G2: Offline attendance (queue + roster cache) ──────────────────
// The ONLY offline-write flow in V1. The queue drains through the EXISTING
// idempotent attendance upsert (saveAttendance, onConflict
// class_id+student_id+attendance_date), so a re-flush is safe (LWW).

export interface PendingAttendanceMark {
  class_id: string;
  student_id: string;
  attendance_date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late' | 'excused';
  client_ts: string; // ISO — drain oldest-first; last write per (class,student,date) wins
}

export interface RosterCacheEntry {
  key: string; // e.g. roster:classes:<date> / roster:students:<classId>:<date>
  value: unknown; // the roster snapshot cached on an ONLINE page load
  cached_at: string; // ISO
}

// ─── OFF-3: Offline Tier-1 writes (cash/payment) ─────────────────────
// Generalizes G2's pending-marks queue to the money path. `op_id` is the
// client-generated idempotency key, reused on every re-push so record_payment
// settles it EXACTLY ONCE (see 000062). Drains oldest-first (client_ts) through
// the EXISTING record_payment writer; a server rejection flags `conflict`
// (surfaced for review, never dropped) instead of deleting the row.
export interface PendingPaymentIntent {
  op_id: string;            // client UUID — PK + record_payment idempotency key
  invoice_id: string;
  student_id: string;
  amount_usd: number;
  amount_lbp: number;
  method: string;           // payment_method_enum value
  reference: string | null;
  exchange_rate: number | null;
  payment_date: string;     // YYYY-MM-DD
  client_ts: string;        // ISO — flush order
  status: 'pending' | 'conflict';
  last_error?: string;
  // Display snapshot so the pending list renders offline without a join.
  invoice_number?: string;
  member_name?: string;
}

// ─── Dexie Database ─────────────────────────────────────────────────

class ProlineOfflineDB extends Dexie {
  // Critical offline tables
  gyms!: Table<OfflineGym, string>;
  profiles!: Table<OfflineProfile, string>;
  students!: Table<OfflineStudent, string>;
  coaches!: Table<OfflineCoach, string>;
  disciplines!: Table<OfflineDiscipline, string>;
  belt_hierarchies!: Table<OfflineBeltHierarchy, string>;
  belt_promotions!: Table<OfflineBeltPromotion, string>;
  classes!: Table<OfflineClass, string>;
  class_schedules!: Table<OfflineClassSchedule, string>;
  class_enrollments!: Table<OfflineClassEnrollment, string>;
  attendance_records!: Table<OfflineAttendanceRecord, string>;
  membership_plans!: Table<OfflineMembershipPlan, string>;
  student_memberships!: Table<OfflineStudentMembership, string>;
  invoices!: Table<OfflineInvoice, string>;
  payments!: Table<OfflinePayment, string>;
  pt_packages!: Table<OfflinePtPackage, string>;
  pt_assignments!: Table<OfflinePtAssignment, string>;
  pt_sessions!: Table<OfflinePtSession, string>;
  leads!: Table<OfflineLead, string>;
  camps!: Table<OfflineCamp, string>;
  camp_registrations!: Table<OfflineCampRegistration, string>;

  // Sync infrastructure
  sync_queue!: Table<SyncQueueItem, number>;
  sync_metadata!: Table<SyncMetadata, string>;

  // G2: offline attendance
  pending_attendance!: Table<PendingAttendanceMark, [string, string, string]>;
  roster_cache!: Table<RosterCacheEntry, string>;

  // OFF-3: offline payment queue
  pending_payments!: Table<PendingPaymentIntent, string>;

  constructor() {
    super('proline_offline_db');

    this.version(1).stores({
      // Primary tables — keyed by UUID (id)
      gyms: 'id, slug',
      profiles: 'id, gym_id',
      students: 'id, gym_id, profile_id, is_active',
      coaches: 'id, gym_id, profile_id, is_active',
      disciplines: 'id, gym_id, is_active',
      belt_hierarchies: 'id, discipline_id',
      belt_promotions: 'id, student_id, coach_id, discipline_id, promotion_date',
      classes: 'id, gym_id, discipline_id, coach_id, status, is_active',
      class_schedules: 'id, class_id, day_of_week',
      class_enrollments: 'id, class_id, student_id',
      attendance_records: 'id, class_id, student_id, attendance_date, _is_dirty, _sync_status',
      membership_plans: 'id, gym_id, is_active',
      student_memberships: 'id, student_id, plan_id, status',
      invoices: 'id, student_id, status',
      payments: 'id, invoice_id, student_id, payment_date, _is_dirty, _sync_status',
      pt_packages: 'id, gym_id, is_active',
      pt_assignments: 'id, student_id, package_id, coach_id, is_active',
      pt_sessions: 'id, student_id, coach_id, scheduled_at, status',
      leads: 'id, status',
      camps: 'id, gym_id, status',
      camp_registrations: 'id, camp_id, student_id, status',

      // Sync infrastructure
      sync_queue: '++id, table_name, record_id, created_at',
      sync_metadata: 'table_name',
    });

    // G2: additive upgrade — offline-attendance queue + roster cache. The
    // compound PK [class_id+student_id+attendance_date] makes a re-mark REPLACE
    // the queued row (local LWW + natural dedup); client_ts orders the flush.
    this.version(2).stores({
      pending_attendance: '[class_id+student_id+attendance_date], client_ts, class_id, attendance_date',
      roster_cache: 'key, cached_at',
    });

    // OFF-3: additive upgrade — offline payment queue. Keyed by the client op_id
    // (the record_payment idempotency key); client_ts orders the flush, status
    // surfaces conflicts.
    this.version(3).stores({
      pending_payments: 'op_id, client_ts, invoice_id, status',
    });
  }
}

// Singleton instance
let dbInstance: ProlineOfflineDB | null = null;

export function getOfflineDB(): ProlineOfflineDB {
  if (!dbInstance) {
    dbInstance = new ProlineOfflineDB();
  }
  return dbInstance;
}

export { ProlineOfflineDB };
export default getOfflineDB;
