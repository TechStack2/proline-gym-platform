// ============================================================
// DB Module Barrel Export
// PRO LINE Gym Platform — Phase D Offline Sync & PWA
// ============================================================

export { getOfflineDB, ProlineOfflineDB } from '@/lib/db/schema';
export { getSyncEngine, SyncEngine, isOnline } from '@/lib/db/sync-engine';
export type {
  OfflineGym,
  OfflineProfile,
  OfflineStudent,
  OfflineCoach,
  OfflineDiscipline,
  OfflineBeltHierarchy,
  OfflineBeltPromotion,
  OfflineClass,
  OfflineClassSchedule,
  OfflineClassEnrollment,
  OfflineAttendanceRecord,
  OfflineMembershipPlan,
  OfflineStudentMembership,
  OfflineInvoice,
  OfflinePayment,
  OfflinePtPackage,
  OfflinePtSession,
  OfflineLead,
  OfflineCamp,
  OfflineCampRegistration,
  SyncQueueItem,
  SyncMetadata,
  SyncOperation,
} from '@/lib/db/schema';
export type {
  SyncStatus,
  SyncProgress,
  SyncResult,
} from '@/lib/db/sync-engine';
