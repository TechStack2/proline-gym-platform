/**
 * DS 2.0 §2.3 — THE status vocabulary.
 *
 * The single place a domain status picks a colour. Before this module there were
 * six competing conventions: `STATUS_BADGE` in billing/reconcile, a forked copy
 * in the portal that silently dropped `void`, four different membership-state
 * maps that disagreed on whether `overdue` is amber or red and whether `active`
 * is green-700 or green-800, plus inline `is_active ? green : gray` ternaries.
 * DA-32 is the visible symptom; this is the cause.
 *
 * Two rules from §1.3 are encoded here and nowhere else:
 *  · **Status is never brand.** Paid/Active are success, Pending is warning,
 *    Lapsed is neutral (calm, not alarm), Overdue is danger.
 *  · **`partial` exists.** DA-11b: a green "Paid" chip sitting above a red
 *    "Balance: $33.00" is the app contradicting itself. "Partially paid" is a
 *    first-class state.
 *
 * Labels are i18n KEYS (`statuses.*`), not the hardcoded tri-lingual maps the old
 * helpers carried — so a new status is a missing key the §2.7 gate catches.
 */

export type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'brand';

export type StatusEntry = {
  variant: StatusVariant;
  /** Key within the `statuses` namespace. */
  i18nKey: string;
  /** §2.3: void reads as struck through, not merely grey. */
  strikethrough?: boolean;
};

export type StatusDomain = 'invoice' | 'member' | 'registration' | 'attendance';

const INVOICE: Record<string, StatusEntry> = {
  paid: { variant: 'success', i18nKey: 'paid' },
  partial: { variant: 'warning', i18nKey: 'partial' }, // DA-11b
  pending: { variant: 'neutral', i18nKey: 'pending' },
  overdue: { variant: 'danger', i18nKey: 'overdue' },
  cancelled: { variant: 'neutral', i18nKey: 'cancelled' },
  refunded: { variant: 'info', i18nKey: 'refunded' },
  void: { variant: 'neutral', i18nKey: 'void', strikethrough: true },
};

const MEMBER: Record<string, StatusEntry> = {
  active: { variant: 'success', i18nKey: 'active' },
  expiring: { variant: 'warning', i18nKey: 'expiring' },
  overdue: { variant: 'danger', i18nKey: 'memberOverdue' },
  owing: { variant: 'danger', i18nKey: 'owing' },
  // §1.3/§2.4: a lapsed member is a fact, not an alarm.
  lapsed: { variant: 'neutral', i18nKey: 'lapsed' },
  frozen: { variant: 'info', i18nKey: 'frozen' },
  none: { variant: 'neutral', i18nKey: 'noMembership' },
  inactive: { variant: 'neutral', i18nKey: 'inactive' },
};

const REGISTRATION: Record<string, StatusEntry> = {
  active: { variant: 'success', i18nKey: 'active' },
  requested: { variant: 'warning', i18nKey: 'requested' },
  waitlisted: { variant: 'info', i18nKey: 'waitlisted' },
  cancelled: { variant: 'neutral', i18nKey: 'cancelled' },
  rejected: { variant: 'neutral', i18nKey: 'rejected' },
  expired: { variant: 'neutral', i18nKey: 'expired' },
  suspended: { variant: 'warning', i18nKey: 'suspended' },
};

const ATTENDANCE: Record<string, StatusEntry> = {
  present: { variant: 'success', i18nKey: 'present' },
  absent: { variant: 'danger', i18nKey: 'absent' },
  late: { variant: 'warning', i18nKey: 'late' },
  excused: { variant: 'info', i18nKey: 'excused' },
  no_show: { variant: 'danger', i18nKey: 'noShow' },
};

const DOMAINS: Record<StatusDomain, Record<string, StatusEntry>> = {
  invoice: INVOICE,
  member: MEMBER,
  registration: REGISTRATION,
  attendance: ATTENDANCE,
};

const UNKNOWN: StatusEntry = { variant: 'neutral', i18nKey: '' };

/**
 * The `{variant, i18nKey}` for a domain status. An unmapped value degrades to a
 * neutral chip with no key, so the caller renders the humanized enum rather than
 * an unstyled fallback (the bug the portal's forked map shipped for `void`).
 */
export function statusEntry(
  domain: StatusDomain,
  status: string | null | undefined,
): StatusEntry {
  if (!status) return UNKNOWN;
  return DOMAINS[domain][status] ?? UNKNOWN;
}
