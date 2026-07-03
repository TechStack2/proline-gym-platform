import { defineConfig, devices } from '@playwright/test';

/**
 * Verification harness (Prompt V1). "Done" = observed in a browser against the
 * coherent Supabase DB — not tsc/build. Logs in as each demo role, asserts each
 * portal renders REAL data, and screenshots every portal.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// ISO-DB: each worker SLOT runs against its OWN pre-seeded gym (slug `<base>-w<slot>`,
// see e2e/roles.ts), so the suite parallelizes across workers without shared-data
// collisions. `E2E_WORKERS` (CI) drives BOTH this worker count AND the number of
// gyms CI pre-seeds + the storageState files auth.setup.ts writes — they must match.
// fullyParallel stays FALSE on purpose: that keeps each spec FILE pinned to a single
// worker (→ a single gym) with its tests in order. Splitting one file's tests across
// workers (fullyParallel:true) would cross gyms mid-spec and break every ordered
// create→assert flow. File-level parallelism across N workers already saturates the
// runner's cores (the ~⅓-minutes cost win) safely.
const WORKERS = process.env.CI ? Math.max(1, parseInt(process.env.E2E_WORKERS || '4', 10)) : 1;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // ISO-DB: the parallel local stack (workers>1 on one app server) has more
  // contention than the old workers:1 cloud baseline → the rotating heavy specs
  // (ml1/ax1/fd2/off3…) occasionally need a 3rd attempt to recover. retries:2.
  retries: process.env.CI ? 2 : 0,
  workers: WORKERS,
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
      // ISO-DB: auth is per-worker now — owner.spec declares `test.use({ authRole: 'owner' })`.
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'reception',
      dependencies: ['setup'],
      testMatch: /reception\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'coach',
      dependencies: ['setup'],
      testMatch: /coach\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'student',
      dependencies: ['setup'],
      testMatch: /student\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
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
      // Notification read-path slice (Prompt F2 / Workstream B): asserts the
      // RECIPIENT (student → pt_approved, coach → pt_assigned) SEES the
      // notification on the RLS-scoped /notifications page. ISO-DB: self-seeds
      // the request→approve in beforeAll (own gym), so it no longer depends on
      // the `pt` spec's side effects — `setup` only.
      name: 'notifications',
      dependencies: ['setup'],
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
      // ISO-DB: opens its own owner context via ROLES.owner.storage (per-worker).
      use: { ...devices['Desktop Chrome'] },
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
      // PWA-SESSION: a relaunched installed PWA (manifest start_url '/') with a
      // valid session must land on the user's HOME, not the marketing landing.
      // Re-enters the landing root with each role's storageState (== the persisted
      // session) and asserts the entry-redirect. Its own storageState contexts.
      name: 'pwa-session',
      dependencies: ['setup'],
      testMatch: /pwa-session\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // NO-MEMBERSHIP: membership is a per-gym OPTIONAL product. Seeds its OWN
      // isolated gym with membership DISABLED (service-role seed) and proves the
      // disabled gym shows classes+PT + hides every membership surface — so the
      // per-worker gyms (ml1/pause-card/billing) stay membership-ENABLED.
      name: 'no-membership',
      dependencies: ['setup'],
      testMatch: /no-membership\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PWA-MOBILE-UX: installed-mobile-PWA shell polish — NativeTabBar items scale
      // up on Pro-Max widths (#2); language switcher in Settings + the mobile More
      // menu, tail not clipped (#3). Opens its own Pro-Max-viewport owner context.
      name: 'pwa-mobile-ux',
      dependencies: ['setup'],
      testMatch: /pwa-mobile-ux\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // DUNNING-AUTO: auto WhatsApp renewal reminders (opt-in, deduped, record
      // mode). Seeds its OWN isolated opted-in + opted-out gyms (service-role seed)
      // and drives POST /api/dunning/run — one reminder, no duplicate, zero when
      // opted out. Own fresh owner contexts.
      name: 'dunning-auto',
      dependencies: ['setup'],
      testMatch: /dunning-auto\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // WL-LANDING: the public landing renders the RESOLVED gym's branding (name +
      // brand color, logo/hero/tagline) — set gym renders its look, unset = the
      // Proline default. Seeds its OWN isolated gyms; loads anon via ?gym=<slug>.
      name: 'wl-landing',
      dependencies: ['setup'],
      testMatch: /wl-landing\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // WL-DOMAIN-ROUTING: the app resolves the gym by request Host (gym_domains).
      // A mapped custom domain (mocked via x-forwarded-host) renders that gym's
      // branded landing; ?gym= still works; an unmapped host → the default gym.
      name: 'wl-domain-routing',
      dependencies: ['setup'],
      testMatch: /wl-domain-routing\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // GO-LIVE-GUARDS: TVA-0 gym bills the exact configured price; the leads
      // status select never offers 'converted'; the default login leaks no demo
      // password. Seeds its OWN isolated gym (tax_rate=0 via service role).
      name: 'go-live-guards',
      dependencies: ['setup'],
      testMatch: /go-live-guards\.spec\.ts$/,
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
      // E1 camps: owner + guardian + anon. Runs last (fills the seeded camp).
      name: 'e1',
      dependencies: ['setup'],
      testMatch: /e1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PT-2 signature booking: coach + member + staff + race contexts. Last.
      name: 'pt2',
      dependencies: ['setup'],
      testMatch: /pt2\.spec\.ts/,
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
    {
      // ML-1 membership lifecycle: tick-driven renewals/dunning/freeze — the
      // tick mutates gym-wide billing state nothing later should see…
      // ISO-DB: ml1 RENEWS the seeded "Karim ends today" membership (FD-1 seed),
      // which fd1 reads as its "expiring today" row. Under per-worker arbitrary
      // order a shared slot could run ml1 first → fd1 hard-fails (the renewal
      // persists, so retry can't recover). Depend on fd1 so fd1 always sees the
      // pristine fixture first (re-encodes the old fd1<ml1 array order).
      name: 'ml1',
      dependencies: ['setup', 'fd1'],
      testMatch: /ml1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // …except UX-2 (LAST): wizards + settings editors + trials loop. It
      // creates run-scoped rows (student/lead/plan/discipline) and flips its
      // OWN leads only, but reads Karim's ML-1-mutated membership card for the
      // plan-change picker assert — so it must follow ml1.
      name: 'ux2',
      dependencies: ['setup'],
      testMatch: /ux2\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // AX-1 Arabic-active smoke — read-only across all four shells.
      name: 'ax1',
      dependencies: ['setup'],
      testMatch: /ax1-ar\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // RLS-ISOLATION — cross-tenant read isolation on audit_logs + pt_sessions.
      // API-only (the `request` fixture + a real GoTrue login): provisions marker
      // rows in this worker's gym + the demo gym and proves gym A can't read gym
      // B's rows. Anchored testMatch ($) to avoid substring collisions.
      name: 'rls',
      dependencies: ['setup'],
      testMatch: /rls-isolation\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // FIN-1 horizons + owner finances + win-back: it pays the Horizon invoice
      // and reinstates the Dropped member (its own isolated fixtures).
      name: 'fin1',
      dependencies: ['setup'],
      testMatch: /fin1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PAUSE-CARD: Today surfaces currently-paused memberships + one-tap Resume.
      // Creates its OWN member + membership + freeze (never touches the seeded
      // Karim that ml1 freezes), so it is fully isolated.
      name: 'pause-card',
      dependencies: ['setup'],
      testMatch: /pause-card\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // GRW-1 growth funnel: creates a campaign + anon captures + converts a lead.
      name: 'grw1',
      dependencies: ['setup'],
      testMatch: /grw1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // ON-1 portal invites: adopts login-less profiles into auth users.
      name: 'on1',
      dependencies: ['setup'],
      testMatch: /on1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // DEMO-GUARDIAN: the 5th demo login (guardian@prolinegym.lb). Login-page
      // entry (5 accounts, EN+AR) + a fresh sign-in proving the kid-switcher
      // shows the linked hero (Karim). Read-only against the SHARED proline demo
      // (its own anon→login contexts, no storageState).
      name: 'demo-guardian',
      dependencies: ['setup'],
      testMatch: /demo-guardian\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // SETTINGS-LIVE: the gym editor + exchange-rate Settings forms PERSIST
      // (audit P0 — both were dead stubs). Owner-only; SELF-RESTORING: the gym
      // name is put back and the global exchange rate is corrected back to the
      // seeded value via the 000075 upsert, so other specs see steady state.
      name: 'settings-live',
      dependencies: ['setup'],
      testMatch: /settings-live\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // LOGIN-LIMITER: the auth limiter is per-(IP+identifier), not per-IP — one
      // noisy account can't lock out a gym's shared NAT wifi. Anon contexts; uses
      // fixture phones (no accounts needed — the limiter keys on the SUBMITTED
      // identifier). Runs with the DEFAULT per-id limit (e2e.yml only raises the
      // per-IP ceiling), so it exercises the real posture.
      name: 'login-limiter',
      dependencies: ['setup'],
      testMatch: /login-limiter\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // G1 WhatsApp channel: flips the gym's WhatsApp config to active and
      // records outbound rows; mutates gym config nothing later should read.
      name: 'g1',
      dependencies: ['setup'],
      testMatch: /g1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // F3 waivers: bumps the gym's waiver template version (flips every
      // member to "outdated"); append-only signatures, nothing later reads them.
      name: 'f3',
      dependencies: ['setup'],
      testMatch: /\/f3\.spec\.ts$/, // anchored: must not also match off3.spec.ts

      use: { ...devices['Desktop Chrome'] },
    },
    {
      // G2 offline attendance: toggles context.setOffline + queues/flushes
      // attendance marks via the idempotent upsert; isolated browser contexts.
      name: 'g2',
      dependencies: ['setup'],
      testMatch: /g2\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // AX-2 landing polish — anon (no storageState); asserts hero/icons/
      // map + the bare-landing trial submit (default gym, no ?gym=).
      name: 'ax2',
      dependencies: ['setup'],
      testMatch: /ax2\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // FD-2 Today 360 — distinct Today/Week/Month card sets + PWA footer.
      // Records a paid-this-month (register-to-class + pay) for the Month revenue
      // proof; a mobile-viewport test asserts the footer fix.
      name: 'fd2',
      dependencies: ['setup'],
      testMatch: /fd2\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // TEAM-1 Coach 360 hub + Day Diary floor lens. Drives a PT-2 sale + override
      // booking, then proves the diary (class+PT+open gaps + Coach-360 link), the
      // Coach 360 panels (incl. reception availability-edit/PT-book that persist),
      // and the owner/head_coach-only deactivate. Switches roles internally
      // (owner + reception); appended at the END — runs LAST.
      name: 'team1',
      dependencies: ['setup'],
      testMatch: /team1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // AX-3 auth-shell guard: a server-HTML check that the auth route renders a
      // single <html>/<body> (no nested-layout duplication → the removeChild
      // crash). Reads raw HTML via a browser navigation; depends on setup so it
      // runs against the warm server (the bare APIRequestContext path flaked).
      name: 'auth-shell',
      dependencies: ['setup'],
      testMatch: /auth-shell\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // DRILL-360 — every 360 card drills + the Month revenue/movement cards
      // reconcile (drilled rows sum/count to the headline). Seeds a paid class
      // registration for deterministic revenue; runs LAST.
      name: 'drill360',
      dependencies: ['setup'],
      testMatch: /drill360\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // MEMBER-ENRICH — read-time class+discipline(+belt+status) on the member
      // cards, Member-360 enrollments panel, and the class roster. Creates a
      // fresh class + registers the seeded member; isolated owner contexts.
      // Appended at the END — runs LAST.
      name: 'member-enrich',
      dependencies: ['setup'],
      testMatch: /member-enrich\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // OFF-1 installed-PWA offline foundation on a DESKTOP viewport: manifest
      // linked/installable, the shell offline banner engages offline + the SW
      // serves the cached shell, online clears. Reuses the G2 setOffline harness;
      // isolated owner contexts. Appended at the END — runs LAST.
      name: 'off1',
      dependencies: ['setup'],
      testMatch: /off1\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PORTAL-FND portal design-system + shell foundation: the member + coach
      // portals adopt the ONE unified themed shell (portal-kit) on desktop +
      // mobile, the ui/* + ActionCard/DrillDetails kit renders portal-side, and
      // /ar is RTL-clean. Switches roles internally (student + coach contexts at
      // two viewports); read-only. Appended at the END — runs LAST.
      name: 'portal-fnd',
      dependencies: ['setup'],
      testMatch: /portal-fnd\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PORTAL-SHELL: responsive single title on the portal (SHELL-IA echo
      // follow-up) — one title per breakpoint (mobile chrome large title / desktop
      // content H1, never title-less), /ar clean. Opens its own student contexts
      // at two viewports; read-only.
      name: 'portal-shell',
      dependencies: ['setup'],
      testMatch: /portal-shell\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // COACH-SHELL: same responsive single-title fix on the coach shell (the
      // PORTAL-SHELL follow-up) — one title per breakpoint, /ar clean. Opens its
      // own coach contexts at two viewports; read-only.
      name: 'coach-shell',
      dependencies: ['setup'],
      testMatch: /coach-shell\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // COACH-LP grandiose coach showcase on the landing + coach-edit→admin-publish:
      // coach (coach@) self-edits → PENDING draft → owner publishes in Coach-360 →
      // the coach appears on the anon landing; coming-soon treatment; RLS leak guard
      // (active-but-hidden + drafts never anon-visible); reception can edit not
      // publish; /ar RTL. Switches roles internally (coach + owner + reception +
      // anon contexts). Appended at the END — runs LAST.
      name: 'coach-lp',
      dependencies: ['setup'],
      testMatch: /coach-lp\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // COACH360-PORTAL: the coach's own drillable premium 360 hub (portal home) —
      // Today · This Week · My Students (by discipline/belt) · PT · Trials · Profile.
      // Reads-only; proves render + reconcile (students rows → headline) + drill +
      // /ar + no coach-tab regression. Opens its own coach context (ROLES.coach),
      // so it must NOT pin a single session. Appended at the END.
      name: 'coach360-portal',
      dependencies: ['setup'],
      testMatch: /coach360-portal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // MEMBER360-PORTAL: the member's own drillable premium 360 hub (portal home) —
      // Membership · Billing · PT · Belt · Classes+attendance, each drilling into its
      // tab + reconciling (billing rows → balance; attendance rows → count). Read-only;
      // preserves the B3 guardian kid-switcher, waivers, camps, lifecycle banner + the
      // IA-2 self-view testids. Opens its own student/parent contexts → must NOT pin a
      // single session. testMatch ANCHORED to this exact file (it must NOT overlap the
      // staff `member360.spec.ts` project). Appended at the END.
      name: 'member360-portal',
      dependencies: ['setup'],
      testMatch: /member360-portal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PORTAL-MODAL systemic fix: inline `fixed inset-0` modals reachable on a
      // PageTransition shell (portal/coach/mobile-dashboard) are portaled to <body>
      // via <ModalPortal>, staying viewport-centered on a scrolled page. Proves
      // book-pt (portal, self-seeded PT) + form-wizard (add-lead) viewport-centered;
      // switches roles internally at a mobile viewport. Appended at the END.
      name: 'portal-modal',
      dependencies: ['setup'],
      testMatch: /portal-modal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // OFF-2 offline reads: SyncEngine.pullAll primes the Dexie mirror on login;
      // /desk (client) reads it so the front desk finds a member + basics +
      // today's schedule + a roster OFFLINE from cache (G2 setOffline harness),
      // edit gated, /ar clean. Appended at the END — runs LAST.
      name: 'off2',
      dependencies: ['setup'],
      testMatch: /off2\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // OFF-3 — the front desk RECORDS offline: a payment queued in Dexie pushes
      // through record_payment on reconnect, idempotent on a client op_id (exactly
      // one canonical record), with pending UX + conflict surfacing; /ar clean.
      // G2 setOffline harness. Appended at the END — runs LAST.
      name: 'off3',
      dependencies: ['setup'],
      testMatch: /\/off3\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // OFF-4 — reconciliation & conflict resolution: a conflicted offline payment
      // is RESOLVABLE (discard-with-audit / re-submit corrected), reconciles against
      // server truth on reconnect, and survives an offline SW cold-open; /ar clean.
      // G2 setOffline harness. testMatch ANCHORED ($) — an unanchored regex would
      // substring-collide (the off3↔f3 trap). Appended at the END — runs LAST.
      name: 'off4',
      dependencies: ['setup'],
      testMatch: /\/off4\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // OFF-3b — offline lead capture: a walk-in lead captured offline queues in the
      // unified outbox (3rd path) + pushes idempotently through addLead on reconnect
      // = exactly one canonical lead; conflicts reuse OFF-4's resolution loop; /ar
      // clean. testMatch ANCHORED ($). Appended at the END — runs LAST.
      name: 'off3b',
      dependencies: ['setup'],
      testMatch: /\/off3b\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PWA-INSTALL — the platform-aware, dismissible "Install the app" card on the
      // front-desk hub (Today): renders + manual steps (Safari) / native prompt
      // (Chromium); no nag when installed (standalone); dismiss remembered; /ar clean.
      // testMatch ANCHORED ($). Appended at the END — runs LAST.
      name: 'pwa-install',
      dependencies: ['setup'],
      testMatch: /\/pwa-install\.spec\.ts$/,
      // ISO-DB: opens its own owner context via ROLES.owner.storage (per-worker).
      use: { ...devices['Desktop Chrome'] },
    },
    // E2E-TIERED — the `smoke` project materializes ONLY under E2E_TIERED=1 (the
    // targeted branch-run path: `gh workflow run e2e.yml -f projects="<slice>"`).
    // It is ABSENT from the default config, so the FULL push-to-main union gate's
    // project set + coverage are unchanged (smoke.spec.ts is matched by no project
    // there → never runs). testMatch ANCHORED ($).
    ...(process.env.E2E_TIERED === '1'
      ? [{
          name: 'smoke',
          dependencies: ['setup'] as string[],
          testMatch: /\/smoke\.spec\.ts$/,
          use: { ...devices['Desktop Chrome'] },
        }]
      : []),
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
