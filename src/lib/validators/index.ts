// ============================================================
// Barrel export — all Zod validation schemas & inferred types
// PRO LINE Gym Platform — Layer 3: SSOT Validation
// ============================================================

// ─── Belts ─────────────────────────────────────────────────────────
export {
  BELT_RANK_VALUES,
  BELT_SORT_ORDER,
  beltRankEnum,
  beltPromotionSchema,
  isValidBeltPromotion,
} from './belts.schema';
export type { BeltRank, BeltPromotionInput } from './belts.schema';

// ─── Leads ─────────────────────────────────────────────────────────
export {
  LEAD_STATUS_VALUES,
  leadStatusEnum,
  leadInsertSchema,
  leadUpdateSchema,
  leadStatusUpdateSchema,
} from './leads.schema';
export type { LeadInsert, LeadUpdate, LeadStatusUpdate } from './leads.schema';
export type { LeadStatus } from './leads.schema';

// ─── Camps ─────────────────────────────────────────────────────────
export {
  campInsertSchema,
  campUpdateSchema,
  campFormSchema,
  campRegistrationSchema,
} from './camps.schema';
export type { CampInsert, CampUpdate, CampFormValues, CampRegistration } from './camps.schema';

// ─── Personal Training ─────────────────────────────────────────────
export {
  ptPackageInsertSchema,
  ptPackageUpdateSchema,
  ptSessionBookingSchema,
  ptAssignmentInsertSchema,
  ptAssignmentUpdateSchema,
} from './pt.schema';
export type {
  PtPackageInsert,
  PtPackageUpdate,
  PtSessionBooking,
  PtAssignmentInsert,
  PtAssignmentUpdate,
} from './pt.schema';

// ─── Rentals ───────────────────────────────────────────────────────
export {
  rentalInsertSchema,
  rentalUpdateSchema,
  rentalBookingSchema,
  rentalConflictCheckSchema,
} from './rentals.schema';
export type { RentalInsert, RentalUpdate, RentalBooking, RentalConflictCheck } from './rentals.schema';

// ─── Students ──────────────────────────────────────────────────────
export {
  GENDER_VALUES,
  genderEnum,
  studentInsertSchema,
  studentUpdateSchema,
} from './students.schema';
export type { StudentInsert, StudentUpdate } from './students.schema';

// ─── Memberships ───────────────────────────────────────────────────
export {
  MEMBERSHIP_TYPE_VALUES,
  MEMBERSHIP_STATUS_VALUES,
  membershipTypeEnum,
  membershipStatusEnum,
  membershipInsertSchema,
  membershipUpdateSchema,
} from './memberships.schema';
export type { MembershipInsert, MembershipUpdate } from './memberships.schema';

// ─── Attendance ─────────────────────────────────────────────────────
export {
  ATTENDANCE_STATUS_VALUES,
  attendanceStatusEnum,
  attendanceRecordSchema,
} from './attendance.schema';
export type { AttendanceStatus, AttendanceRecord } from './attendance.schema';
