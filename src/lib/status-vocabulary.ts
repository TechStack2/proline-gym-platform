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

export type StatusDomain =
  | 'invoice'
  | 'member'
  | 'registration'
  | 'attendance'
  | 'trial'
  | 'landing'
  | 'pt'
  | 'lead'
  | 'camp';

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
  // W3b: camp_registrations' awaiting-confirmation state.
  pending: { variant: 'warning', i18nKey: 'pending' },
};

const ATTENDANCE: Record<string, StatusEntry> = {
  present: { variant: 'success', i18nKey: 'present' },
  absent: { variant: 'danger', i18nKey: 'absent' },
  late: { variant: 'warning', i18nKey: 'late' },
  excused: { variant: 'info', i18nKey: 'excused' },
  no_show: { variant: 'danger', i18nKey: 'noShow' },
};

// W3a (§2 "extend, never fork"): the two coach-shell domains the adoption pass
// surfaced. Labels stay with their callers (leads.trial_status.* / coachHub
// carry richer context), so entries here pick ONLY the variant via `label`
// override at the call site — but the color decision still lives here.
const TRIAL: Record<string, StatusEntry> = {
  scheduled: { variant: 'info', i18nKey: 'scheduled' },
  // W3b: PT session `proposed` rides this appointment-shaped domain too.
  proposed: { variant: 'warning', i18nKey: 'pending' },
  completed: { variant: 'success', i18nKey: 'completed' },
  no_show: { variant: 'danger', i18nKey: 'noShow' },
  cancelled: { variant: 'neutral', i18nKey: 'cancelled' },
};

// W3b (§2 "extend, never fork") — pt_assignment_status, the PtPackageCard's
// STATUS_TONE fork folded in. `expired` is danger here (an expired package is
// the renewal prompt), unlike registration's neutral `expired` (history).
const PT: Record<string, StatusEntry> = {
  requested: { variant: 'warning', i18nKey: 'requested' },
  active: { variant: 'success', i18nKey: 'active' },
  expired: { variant: 'danger', i18nKey: 'expired' },
  completed: { variant: 'neutral', i18nKey: 'completed' },
  rejected: { variant: 'neutral', i18nKey: 'rejected' },
  cancelled: { variant: 'neutral', i18nKey: 'cancelled' },
};

const LANDING: Record<string, StatusEntry> = {
  live: { variant: 'success', i18nKey: 'live' },
  pending: { variant: 'warning', i18nKey: 'pending' },
  coming_soon: { variant: 'info', i18nKey: 'comingSoon' },
  hidden: { variant: 'neutral', i18nKey: 'hidden' },
};

// W3b: camp lifecycle (camps-board's STATUS_TONE fork folded in). `full` is a
// warning to the desk (no more seats to sell), `completed` is history.
const CAMP: Record<string, StatusEntry> = {
  draft: { variant: 'neutral', i18nKey: '' },
  open: { variant: 'success', i18nKey: '' },
  full: { variant: 'warning', i18nKey: '' },
  in_progress: { variant: 'info', i18nKey: '' },
  completed: { variant: 'neutral', i18nKey: '' },
  cancelled: { variant: 'neutral', i18nKey: 'cancelled' },
};

// W3b: the lead pipeline stages (leads-types' STATUS_COLORS fork folded in).
// `lost` is a fact, not an alarm (§1.3 calm rule).
const LEAD: Record<string, StatusEntry> = {
  new: { variant: 'info', i18nKey: '' },
  contacted: { variant: 'warning', i18nKey: '' },
  trial_scheduled: { variant: 'info', i18nKey: '' },
  trial_completed: { variant: 'brand', i18nKey: '' },
  converted: { variant: 'success', i18nKey: '' },
  lost: { variant: 'neutral', i18nKey: '' },
};

const DOMAINS: Record<StatusDomain, Record<string, StatusEntry>> = {
  invoice: INVOICE,
  member: MEMBER,
  registration: REGISTRATION,
  attendance: ATTENDANCE,
  trial: TRIAL,
  landing: LANDING,
  pt: PT,
  lead: LEAD,
  camp: CAMP,
};

const UNKNOWN: StatusEntry = { variant: 'neutral', i18nKey: '' };

/** The §2.3 tint utility a variant wears (globals.css `.tint-*`). ONE map —
 *  StatusChip and every non-chip tinted surface read it from here (W3b). */
export const VARIANT_TINT: Record<StatusVariant, string> = {
  success: 'tint-success',
  warning: 'tint-warning',
  danger: 'tint-danger',
  info: 'tint-info',
  neutral: 'tint-neutral',
  brand: 'tint-brand',
};

/** The tint class for a domain status (for surfaces that are not chips). */
export function statusTintClass(domain: StatusDomain, status: string | null | undefined): string {
  return VARIANT_TINT[statusEntry(domain, status).variant];
}

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
