/**
 * Canonical notification `type` values for the producer layer (Cycle 5 / M0).
 *
 * Flow prompts (22–24) import `NotificationType` and the per-type i18n key map
 * rather than hardcoding strings. Each type has a matching i18n entry under the
 * `notifications.messages.<type>` namespace in en/ar/fr.
 */
export const NOTIFICATION_TYPES = [
  'pt_requested',
  'pt_approved',
  'pt_assigned',
  'lead_new',
  'trial_scheduled',
  'lead_converted',
  'attendance_absent',
  'belt_promoted',
  'membership_expiring',
  'invoice_overdue',
  'invoice_issued',
  'payment_received',
  'class_requested',
  'class_approved',
  'class_waitlisted',
  'waitlist_promoted',
  'enrollment_confirmed',
  'pt_session_scheduled',
  'pt_session_completed',
  'pt_session_cancelled',
  'pt_session_no_show',
  'pt_credits_exhausted',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Conventional i18n keys for a given notification type, relative to the
 * `notifications` next-intl namespace. Producers may pass these as
 * `titleKey`/`bodyKey`, or pass custom keys for one-off messages.
 */
export function notificationKeys(type: NotificationType): {
  titleKey: string;
  bodyKey: string;
} {
  return {
    titleKey: `messages.${type}.title`,
    bodyKey: `messages.${type}.body`,
  };
}
