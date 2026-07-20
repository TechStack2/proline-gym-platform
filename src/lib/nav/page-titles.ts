/**
 * DS 2.0 §2.1 — THE page-title map.
 *
 * DA-29: every page hand-rolled its own h1 from its own namespace while the shell
 * derived the mobile large title from a second, unrelated list. The two drifted —
 * `/students` said "Members" on mobile and "Students" on desktop, `/schedule`
 * said "Schedule" and "Class Schedule".
 *
 * One route segment → one i18n key → one term on every breakpoint. The
 * terminology call, per §2.1 and the nav config: **"Members"** and **"Team"**
 * win, because that is what the tab bar and the sidebar have always said and the
 * nav is what users navigate by.
 *
 * Keys are FULL dotted paths resolved against a root-scoped translator, so a
 * route whose best title does not live in `nav` can still point at its own
 * namespace without a second mechanism.
 */
export const PAGE_TITLE_KEY: Record<string, string> = {
  // The eight nav workspaces (the mobile tab/sidebar labels are the source).
  today: 'nav.today',
  inbox: 'nav.inbox',
  students: 'nav.members', // DA-29: "Members", never "Students"
  coaches: 'nav.team', // DA-29: "Team", never "Coaches"
  schedule: 'nav.schedule',
  money: 'nav.money',
  settings: 'nav.settings',
  profile: 'nav.profile',
  // Out-of-nav routes that still render the shell chrome.
  setup: 'nav.setup',
  publish: 'nav.publish',
  belts: 'nav.belts',
  pt: 'nav.pt',
  camps: 'nav.camps',
  reports: 'nav.reports',
  attendance: 'nav.attendance',
  classes: 'nav.classes',
  leads: 'nav.leads',
  payments: 'nav.payments',
  invoices: 'nav.invoices',
  disciplines: 'nav.disciplines',
  notifications: 'nav.notifications',
  campaigns: 'nav.campaigns',
  desk: 'nav.desk',
};

/** The staff landing title — what an unmapped segment falls back to. */
export const DEFAULT_PAGE_TITLE_KEY = PAGE_TITLE_KEY.today;

/** The i18n key for a route segment. Unknown segments fall back to the landing. */
export function pageTitleKey(segment: string | null | undefined): string {
  return (segment && PAGE_TITLE_KEY[segment]) || DEFAULT_PAGE_TITLE_KEY;
}
