import { defineConfig, devices } from '@playwright/test';

/**
 * Verification harness (Prompt V1). "Done" = observed in a browser against the
 * coherent Supabase DB — not tsc/build. Logs in as each demo role, asserts each
 * portal renders REAL data, and screenshots every portal.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    locale: 'en',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'owner',
      dependencies: ['setup'],
      testMatch: /owner\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/owner.json' },
    },
    {
      name: 'reception',
      dependencies: ['setup'],
      testMatch: /reception\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/reception.json' },
    },
    {
      name: 'coach',
      dependencies: ['setup'],
      testMatch: /coach\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/coach.json' },
    },
    {
      name: 'student',
      dependencies: ['setup'],
      testMatch: /student\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/student.json' },
    },
    {
      // Cross-portal slice: switches roles internally (opens a fresh context
      // per role from e2e/.auth/*.json), so it must NOT pin a single session.
      name: 'pt',
      dependencies: ['setup'],
      testMatch: /pt\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Notification read-path slice (Prompt F2 / Workstream B): logs in as the
      // RECIPIENT (student → pt_approved, coach → pt_assigned) and asserts they
      // SEE the notification on the bell + /notifications page. Depends on `pt`.
      // Runs IMMEDIATELY after `pt` (before leads/activity-loop/pt-delivery) so
      // the freshly-emitted pt_approved/pt_assigned are still within the bell's
      // "latest 5" — the other slices emit member notifications that would
      // otherwise bury them. The functional bell renders only at the mobile
      // breakpoint, set per-context in the spec.
      name: 'notifications',
      dependencies: ['setup', 'pt'],
      testMatch: /notifications\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Lead → Active-Member cross-portal slice (Prompt 23-R): origination both
      // ways (anon web submit + staff Add Lead) → trial (coach handoff) → atomic
      // convert → member on roster. Switches roles internally (fresh context per
      // role from e2e/.auth/*.json + one anon context), so it must NOT pin a
      // single session.
      name: 'leads',
      dependencies: ['setup'],
      testMatch: /leads\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Member Activity Loop cross-portal slice (Prompt 24-R): enroll → attend
      // (transition-guarded absence) → atomic promote → /portal/progress. Switches
      // roles internally (fresh context per role), so it must NOT pin a session.
      name: 'activity-loop',
      dependencies: ['setup'],
      testMatch: /activity-loop\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PT Session Delivery lifecycle (Prompt C1): request→approve→schedule→
      // complete (the single credit writer) with edge cases E1/E2/E3. Switches
      // roles internally (fresh context per role); must NOT pin a session.
      // Runs LAST: it emits several pt_session_* notifications to the student,
      // which would otherwise bury pt_approved out of the notifications bell test.
      name: 'pt-delivery',
      dependencies: ['setup'],
      testMatch: /pt-delivery\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Billing & Payment slice (Prompt D1): issue → record → reconcile across the
      // staff /invoices surfaces and the member portal. Switches roles internally
      // (owner issues/records; student=Karim reads portal + notifications), so it
      // must NOT pin a single session. Runs LAST: it emits invoice_issued /
      // payment_received to the student, which would otherwise bury the bell test.
      name: 'billing',
      dependencies: ['setup'],
      testMatch: /billing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Admin Presentation Repair (Prompt AR): classes/students/coaches/schedule/
      // payments render real normalized data. Owner-only; runs after billing so a
      // settled invoice already exists in the gym (and AR also self-issues one).
      name: 'ar-admin',
      dependencies: ['setup'],
      testMatch: /ar-admin\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/owner.json' },
    },
    {
      // Recurring-class registration (Prompt B2): request→approve→bill→roster +
      // capacity/waitlist auto-promote. Switches roles internally (owner staff +
      // Karim member), so it must NOT pin a single session. Runs last (emits
      // class_* + invoice_issued to the student).
      name: 'class-registration',
      dependencies: ['setup'],
      testMatch: /class-registration\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Public landing (Prompt LP): a LOGGED-OUT (anon) visitor sees the run gym's
      // live catalog (disciplines/schedule/pricing) + brand via the 000035 anon
      // public-read policies. Creates its own anon context (no storageState).
      name: 'landing',
      dependencies: ['setup'],
      testMatch: /landing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // IA-1 (journey-centric nav + Inbox + Today): nav desktop=mobile + the
      // cross-role inbox approve round-trip. Switches roles internally (owner
      // staff + Karim member) and opens its own mobile-viewport context, so it
      // must NOT pin a single session. Runs after class-registration (both
      // create classes; unique RUN names prevent collisions).
      name: 'ia-nav',
      dependencies: ['setup'],
      testMatch: /ia-nav\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // IA-2 (Member-360 + Money): drives B2/22R/D1 flows then asserts the
      // member file + Money ledger + Prospects re-home + portal self-view.
      // Switches roles internally; runs LAST (emits to the student).
      name: 'member360',
      dependencies: ['setup'],
      testMatch: /member360\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // IA-3 (Schedule unification): week timetable + day coach-diary (both
      // calendar species) + the read-side PT conflict warning. Switches roles
      // internally (owner/student/coach); runs LAST.
      name: 'schedule-cal',
      dependencies: ['setup'],
      testMatch: /schedule-cal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // UX-1 (bell crash fix + add-class wizard): wizard→timetable proof + a
      // zero-pageerror navigation sweep (catches the realtime double-mount
      // crash class). Owner-only.
      name: 'ux1',
      dependencies: ['setup'],
      testMatch: /ux1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // ADM-1 (catalog management): class staged→publish→edit→archive proven
      // anon-side, coach add/deactivate lifecycle, disciplines SSOT, affiliation
      // assets. Owner + anon contexts; runs LAST.
      name: 'adm1',
      dependencies: ['setup'],
      testMatch: /adm1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // B3 (family/household): guardian switcher → request-for-kid → payer
      // invoice → household billing → desk payment + the RLS negative.
      // Switches roles internally (owner + parent).
      name: 'b3',
      dependencies: ['setup'],
      testMatch: /b3\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // ADM-2 (belts + sweep + avatars): archived-discipline absence across
      // pickers, Member-360 promotion round-trip → portal progress, and the
      // avatar upload rendering chain. Owner + student + parent contexts.
      name: 'adm2',
      dependencies: ['setup'],
      testMatch: /adm2\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // REP-1 (attendance history/reports repair + coach date picker, parallel
      // track): coach marks today/yesterday → history + by-class reports render
      // real data on the real model. Switches roles internally (owner reads,
      // coach marks).
      name: 'rep1',
      dependencies: ['setup'],
      testMatch: /rep1\.spec\.ts/,
    },
    {
      // FD-1 (front-desk cockpit): Today 2.0 ActionCards, Member-360 modals,
      // workable lists. MUST run LAST — it drains the approval inbox to prove
      // the Inbox card's collapse line.
      name: 'fd1',
      dependencies: ['setup'],
      testMatch: /fd1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PT-1 (catalog → sale → refill → expiry): owner + coach + student + anon
      // contexts. Runs after fd1 (consumes the run's PT state freely).
      name: 'pt1',
      dependencies: ['setup'],
      testMatch: /pt1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // LPX-1 (landing SEO & polish, parallel track): logged-out /en carries
      // meta/OG/JSON-LD; sitemap.xml + robots.txt respond with expected entries.
      // Anon (no storageState); read-only — order-independent.
      name: 'lpx1',
      dependencies: ['setup'],
      testMatch: /lpx1-seo\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // I18N-1 (fr completeness sweep, parallel track): drives the main surfaces
      // in `fr` (staff/portal/coach/landing) asserting no MISSING_MESSAGE + no
      // raw-key leak. Switches roles internally (owner/student/coach + anon).
      name: 'i18n1',
      dependencies: ['setup'],
      testMatch: /i18n1-fr\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Runs against the PRODUCTION build (`next start`). The middleware is now
  // Edge-compatible (F1.1/V1-F4), so prod serves routes without 500s. CI runs
  // `next build` before the harness; locally, build first or reuse a running server.
  webServer: {
    command: 'npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
