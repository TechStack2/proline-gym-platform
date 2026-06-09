# Journey Catalog — PRO LINE Gym Platform (master registry)

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only — design, not code)
> **Purpose:** the complete inventory of essential user journeys/use-cases to study → dissect → design → rebuild as **cross-portal vertical slices**, one at a time, strangler-style. This is the index that drives the journey-design work; each row gets its own deep design doc + sequential coder prompt.
> **Inputs:** verified schema (`supabase/migrations/`), [`industry-benchmark.md`](./industry-benchmark.md), [`platform-elevation-roadmap.md`](./platform-elevation-roadmap.md), [`cross-portal-workflow-map.md`](./cross-portal-workflow-map.md), and the live code read during 23-R/24-R.

---

## What counts as a "journey" here

A **journey** is an end-to-end flow whose root entity is **created once (usually in Admin), propagates to exactly the portals that need it, and whose state flows back** — with handoffs (notifications) pinging the next actor at each seam. It is **not** a single page. A journey is "done" only when its full propagation works on real data, behavior-green in CI. Use-case **clusters** (analytics, RBAC) that aren't a single propagating flow are listed separately at the end.

## The standard design lens applied to EVERY journey (the mandates)

1. **Origination-first** — open with the channel-complete origination layer (self-serve / staff-manual / automated-inbound), never the happy-path channel. ([principle](../../.claude/…/journey-maps-start-at-origination.md))
2. **Strategic context** — cite the `industry-benchmark.md` 0–5 gap(s) closed + the `platform-elevation-roadmap.md` phase + what's deferred.
3. **Cross-portal vertical slice** — admin→landing→student→coach propagation + state-back, modeled transaction-by-transaction.
4. **Best-practice / best-in-class** — benchmark against Mindbody/Glofox/Zen Planner/Kicksite/Gymdesk; match table-stakes, respect the three leapfrog lanes (Arabic-first, dual-currency, offline+WhatsApp).
5. **Error recovery & edge cases** — explicit failure/rollback paths, idempotency, partial-failure, no-show/cancel/refund, duplicates, minors, multi-discipline, expiry.
6. **Behavior-green + drag read** — proven in the e2e harness on the cloud DB; honest strangle-vs-rewrite signal each slice.

**Maturity target:** L3 Managed for V1 (L4 where a feedback loop is the differentiator).

---

## Master registry

**Status key:** ✅ done · 🔵 in progress · 📐 designed (prompt ready) · 🟡 queued (next to design) · ⚪ not started
**Maturity = current** (0 absent · 1 stub/cosmetic · 2 CRUD · 3 functional workflow/Managed · 4 at-par · 5 leapfrog).

### A. Acquisition & Onboarding
| # | Journey | Spine | Portals | Key entities | Bench gap | Phase | Now | Status |
|---|---|---|---|---|---|:--:|:--:|:--:|
| A1 | **Lead → Active Member** | originate (web/manual/auto) → trial → convert → onboard | Landing·Admin·Coach·Student | leads, trial_classes, profiles, students, memberships, invoices, account_invites | Lead 2→3, intro-offer 1→3, signup 0→3 | 1 | 3 | ✅ 23-R |
| A2 | **Self-signup & online purchase** | visitor self-creates account + buys membership (no staff entry) | Landing·Student | profiles, students, memberships, invoices | Online signup 0/5 | 5 | 0 | ⚪ |
| A3 | **Referral** | member refers friend → lead (source=referral) → reward on convert | Student·Admin·Landing | leads(source_detail), (promo) | Referral 0/5 | 5 | 0 | ⚪ |
| A4 | **Real account activation** | swap 23-R's simulated invite → real OTP/magic-link/WhatsApp; reconcile profile↔auth.users | Student·Platform | account_invites, auth.users, profiles | Passwordless auth | 5/6 | 1 | ⚪ |

### B. Engagement & Progression (the member's recurring life)
| # | Journey | Spine | Portals | Key entities | Bench gap | Phase | Now | Status |
|---|---|---|---|---|---|:--:|:--:|:--:|
| B1 | **Member Activity Loop** | enroll → attend → eligibility → promote → see progress | Admin·Coach·Student | class_enrollments, attendance_records, belt_hierarchies, belt_promotions | Visible progress 1→3, attendance 4, assess 1→L4 | 1 | 2 | 🔵 24-R |
| B2 | **Self-service booking + waitlist** | member books/cancels within policy; capacity + waitlist **auto-promote & notify-next** | Student·Admin·Coach | class_enrollments(+waitlist), classes(capacity) | Self-book 0/5, waitlist 0/5 | 2 | 0 | ⚪ |
| B3 | **Family / household** | one parent manages ≥2 children's schedule/attendance/billing/belts | Student(parent)·Admin | guardians, guardian_students | Family 1/5 | 2 | 1 | ⚪ |
| B4 | **Curriculum & skill assessment** | coach assesses skills → checkpoints → promotion eligibility → member-visible | Coach·Student·Admin | (curriculum—new), belt_hierarchies, belt_promotions | Assessments 1/5, curriculum 0/5 | 3 | 1 | ⚪ |

### C. Service Delivery (Coach)
| # | Journey | Spine | Portals | Key entities | Bench gap | Phase | Now | Status |
|---|---|---|---|---|---|:--:|:--:|:--:|
| C1 | **PT Session Delivery** (seam's other half) | schedule pt_session → deliver → complete (status + decrement) → state-back; **no-show/cancel/refund-credit** | Coach·Student·Admin | pt_sessions, pt_assignments | PT logging 0/5 (22-R partial) | 1/3 | 1 | 🟡 next |
| C2 | **Coach daily ops** | unified "today" (classes + PT) → check-in/log; attendance trends | Coach | classes, pt_sessions, attendance_records | Coach trends 1/5 | 3 | 2 | ⚪ |
| C3 | **Sub / cover management** | coach requests cover → peer accepts → schedule updates + notify | Coach·Admin | classes, class_schedules, (covers—new) | Sub mgmt 0/5 | 3 | 0 | ⚪ |
| C4 | **Coach ↔ member/parent messaging** | in-app threads on the notification spine | Coach·Student | (threads—new), notifications | Messaging 0/5 | 3 | 0 | ⚪ |

### D. Money & Membership
| # | Journey | Spine | Portals | Key entities | Bench gap | Phase | Now | Status |
|---|---|---|---|---|---|:--:|:--:|:--:|
| D1 | **Billing & Payment** | invoice issued → member pays (cash/OMT/Whish) → record → reconcile → receipt | Admin·Student | invoices, payments, exchange_rates | Billing 4 (record), recon 1/5 | 1/4 | 3 | ⚪ |
| D2 | **Membership lifecycle** | purchase → active → **freeze/pause** → upgrade/downgrade → expire | Admin·Student | student_memberships, membership_plans, invoices | Freeze/upgrade 1/5 | 2/4 | 1 | ⚪ |
| D3 | **Renewal & Dunning** (cash-model) | expiring → renewal nudge + invoice (consume auto_renew); overdue → reminder | Admin·Student | student_memberships, invoices | Renewal 1/5, dunning 1/5 | 4 | 1 | ⚪ |
| D4 | **PT package lifecycle** | request → approve → bill → deliver → consume → expire/renew | Student·Admin·Coach | pt_packages, pt_assignments, pt_sessions, invoices | PT 0/5 (22-R did req→approve→bill→roster) | 1/3 | 3 | ⚪ (C1 completes) |

### E. Programs & Events
| # | Journey | Spine | Portals | Key entities | Bench gap | Phase | Now | Status |
|---|---|---|---|---|---|:--:|:--:|:--:|
| E1 | **Summer camp** | create camp → publish (landing) → register → invoice → attend → complete | Admin·Landing·Student·Coach | camps, camp_registrations, camp_attendance, invoices | (MA seasonal staple) | 5 | ? | ⚪ |
| E2 | **Coach/space rental** | list rental → book → invoice → fulfill | Admin·(external) | rentals, rental_bookings, external_coaches, invoices | (revenue line) | 4/5 | ? | ⚪ |

### F. Growth & Retention (Admin engine)
| # | Journey | Spine | Portals | Key entities | Bench gap | Phase | Now | Status |
|---|---|---|---|---|---|:--:|:--:|:--:|
| F1 | **Lead nurture / comms automation** | segmented WhatsApp/SMS/email journeys (intro-offer, win-back, milestone) | Admin·(WhatsApp) | leads, message_logs, notifications | Automated comms 0/5 | 4 | 0 | ⚪ |
| F2 | **Announcement / news broadcast** | publish → fan-out to landing feed + portal feeds + notify | Admin·all | (announcements—new), notifications | (engagement) | 2/4 | 0 | ⚪ |
| F3 | **Waiver / e-sign & documents** | e-sign waiver at signup + on file; medical-cert expiry alerts | Admin·Student | documents | E-sign 0/5 | 4/5 | 1 | ⚪ |

### G. Platform & Cross-cutting
| # | Journey | Spine | Portals | Key entities | Bench gap | Phase | Now | Status |
|---|---|---|---|---|---|:--:|:--:|:--:|
| G1 | **Notification delivery** | producer → in-app bell (✅) → **WhatsApp Cloud API / Twilio fallback** → read | all·Platform | notifications, message_logs | Push 1/5, WhatsApp 6 | 2/6 | 2 | ⚪ (F2/21 built producers) |
| G2 | **Offline-first capture & sync** | attendance/payment/registration offline → Dexie → sync (LWW) | Coach·Admin·Student | (Dexie), attendance_records.offline_sync_id, sync-engine | Offline 2/5 (architected) | 6 | 2 | ⚪ |
| G3 | **Staff onboarding & RBAC** | create staff → assign role/gym → scoped access | Admin·Platform | profiles, user_roles | (ops) | 1 | 3 | ⚪ (foundation done) |

### Use-case clusters (not single-flow journeys)
- **Retention analytics** — MRR, LTV, churn, retention cohorts, expiring, no-shows, late-cancels, attendance heatmaps, trainer performance (Phase 4; today 3 basic reports → 2/5). *Consumes* the data the journeys above generate.
- **Exchange-rate management** — set/track USD↔LBP rate feeding every invoice (operational; `exchange_rates`).
- **Leaf-surface repair slices** — independently rotten admin pages surfaced by 23-R's drag read: `/invoices` DOA, students search broken, i18n `MISSING_MESSAGE`, `<NotificationBell>` portal/coach mount. Each = its own small slice (see [[strangle-validated-leaf-rot]]).

---

## Sequencing — how we tackle them

**Roadmap seams are hard dependencies** (foundation → connective tissue → engagement → coach → admin-growth → marketing → leapfrog). Within that, order by *value × continuity × testability*:

1. **Finish Phase 1 (Connective Tissue):**
   - B1 Member Activity Loop — 🔵 in progress (24-R).
   - **C1 PT Session Delivery** — 🟡 **design next** (the seam's other half; closes the orphaned-`pt_sessions` finding; completes D4; revenue-critical; fully testable).
   - D1 Billing & Payment (the *record→reconcile* half; the time-triggered D3 dunning stays Phase 4).
2. **Phase 2 (Member Engagement):** B2 self-booking+waitlist → B3 family → (B1 already gave visible progress) → G1 push/WhatsApp delivery (begins).
3. **Phase 3 (Coach Enablement):** B4 assessments/curriculum → C2 coach daily ops → C3 subs → C4 messaging.
4. **Phase 4 (Admin Growth):** F1 nurture → D3 renewal/dunning → F2 announcements → F3 e-sign → analytics cluster.
5. **Phase 5 (Marketing Funnel):** A2 self-signup → A3 referral → A4 real activation → E1 camp.
6. **Phase 6 (Leapfrog):** G1 WhatsApp-native finish → G2 offline finish → gamification/curriculum-video.

**Interleave the leaf-rot repair slices** opportunistically when a journey touches the rotten surface (e.g., D1 will want the `/invoices` repair; B-anything will want students-search + the i18n gaps).

---

## Immediate next (design while 24-R executes)

**C1 — PT Session Delivery journey.** Per the standing mandate, designed **deep, multi-angle, best-practice, with explicit error-recovery + edge cases**: schedule → deliver → complete (atomic status + single-writer credit decrement) → state-back; plus no-show, late-cancel, **credit refund/restore**, double-log prevention, pack expiry, reschedule, coach reassignment, and reconciling the **orphaned `pt_sessions`** (credits move with no session record) found in 23-R. It is the other half of the [attendance↔PT seam](./cycle-5/analysis-class-attendance-vs-pt-session-seam.md) and completes D4.

*Next action: confirm C1 as the next design, then I produce its origination-first deep design doc (outline first, per the established rhythm).*
