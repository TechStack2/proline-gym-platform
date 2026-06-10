# Journey Design — Recurring-Class Registration (B2)

> **Created:** 2026-06-10 · **Auditor:** Project Auditor (read-only — design, not code)
> **Status:** DESIGN — awaiting sign-off before the prompt.
> **This is B2 in** [`../journey-catalog.md`](../journey-catalog.md), reframed from "self-booking" to **recurring-class registration** per the client's billing model ([[proline-monetization-model]]): product #3 of three (gym membership · PT packages · **recurring-class registration**). It's the **group-class analog of the PT acquisition flow** (request→approve→bill→roster) and reuses D1's `issue_invoice`, the PT request pattern, B1's attendance roster, and the waitlist auto-promote table-stake.
> **Decisions locked:** request→approve→bill (not auto) · waitlist via status+position · **free cancel** · **monthly-only in B2** (weekly pass V1.1) · **discount = % or fixed amount** · class registration is **standalone** (no gym membership required).

---

## 0. Why this journey (strategic context)
**Benchmark** ([industry-benchmark.md](../industry-benchmark.md)): member self-service class booking + **waitlist that auto-promotes and notifies** = **0/5**, the platform's biggest member-engagement gap. Adapted to Proline's reality, "booking" = **registering for a recurring program for a monthly fee, approval-gated**. This delivers the registration workflow + capacity + waitlist auto-promotion → L3.
**Roadmap:** Phase 2 (Member Engagement), V1 must-have #4. **Defer:** weekly pass (V1.1), per-session drop-in booking (V2 — needs a session-instances layer), self-serve online *payment* (V2 — billing stays cash/OMT/Whish recorded by staff, D1).
**Leapfrog lanes:** Arabic-RTL portal request UI; dual-currency monthly fee; WhatsApp-friendly notifications (the producers G1 will deliver).

## 0.1 Origination layer (how a registration enters)
- **Self-serve:** member/parent **requests** a class in the portal (the new engagement surface). Primary path.
- **Staff-manual:** reception registers a walk-in/phone enquiry directly (request created + can be approved in one motion).
- **Automated:** none (no online self-checkout; billing is staff-recorded — V2).

A request can only target an **active class** the member is age/belt-eligible for (classes carry `min_age/max_age/belt_requirement`).

## 1. Journey at a glance
```
  MEMBER ──request──▶ REQUESTED ──staff approve (+discount)──▶ capacity?
  (portal)                │                                      │
                          │ reject                    available ▼        ▼ full
                          ▼                              ACTIVE          WAITLISTED (position)
                       (cancelled)             + monthly invoice         (no invoice yet)
                                               + roster (class_enrollments)      │
                                                      │ attend (B1)              │ someone cancels
                                                      ▼                          ▼
                                            recurring monthly (D3)      AUTO-PROMOTE next
                                                                        → ACTIVE + invoice + notify
  free cancel anytime → frees a spot → triggers auto-promote
  notifications: class_requested→staff · class_approved/class_waitlisted/waitlist_promoted→member · invoice_issued
```
**Billing fires on the ACTIVE transition** (at approval if a spot is free, or at promotion from waitlist) — a waitlisted member doesn't pay until they actually get the spot.

## 2. Cast & surfaces
| Actor | Role | Surface |
|---|---|---|
| **Member / parent** | requests a class, sees status, cancels | **NEW** portal/classes (browse + request) + portal/schedule (status) |
| **Reception / Owner** | approves (+discount) / rejects, manages registrations + waitlist | **NEW/extend** `(dashboard)/classes/[id]` registrations panel |
| **Coach** | sees roster, takes attendance | `coach/attendance` (B1, unchanged — reads `class_enrollments`) |
| **System** | fires handoffs | bell + `/notifications` (+ future WhatsApp via G1) |

## 3. As-is teardown
- `classes` has **no price** ([000003:9-31](../../supabase/migrations/000003_create_operational_tables.sql#L9)); `class_enrollments` is roster-only (`is_active`, no billing/status/waitlist); `invoice_type_enum` has no class type; the portal is **read-only** (no request path). The AR slice just repaired the admin classes *reads*; B2 adds the registration *write/workflow*. **L0 for the registration product.**

## 4. Data spine
```
classes (+ monthly_fee_usd/lbp, currency)  ──▶ class_registrations (NEW: the billable monthly subscription)
   max_capacity, min_age/max_age, belt_req       student·class·period·fee·discount·status·position·start/end·invoice_id
                                                        │ active ⇒ projects to
                                                        ▼
                                                  class_enrollments (is_active)  ← attendance roster (B1, unchanged)
   invoices (invoice_type='class_registration', monthly)      notifications (recipient=profile_id, FK→profiles ✓)
```
| Table | Change |
|---|---|
| `classes` | **+ `monthly_fee_usd` / `monthly_fee_lbp`** (nullable weekly tier later); discount applied per-registration not here |
| **`class_registrations` (NEW)** | id, class_id, student_id, status (`requested`/`active`/`waitlisted`/`cancelled`/`rejected`/`expired`), `waitlist_position`, `monthly_fee_usd`, `discount_pct`/`discount_amount_usd`, `start_date`/`end_date`, `invoice_id`, approved_by/at, requested_at; UNIQUE(class_id, student_id) where active-ish |
| `class_enrollments` | unchanged shape; an `active` registration **projects** an `is_active` enrollment (attendance roster stays the single source for B1) |
| `invoice_type_enum` | **+ `class_registration`** |

## 5. The registration model (the heart)
- **Pricing** lives on the class (monthly fee, dual-currency). **Discount** (% or fixed) is per-registration, set by staff at approval, applied to the invoice (audited via D1's `issue_invoice` + the payments/audit trail).
- **`class_registrations`** is the billable subscription + status machine + waitlist. **An `active` registration is the source of the billing relationship**; the matching `class_enrollments` row (`is_active`) is the **attendance roster projection** so B1 is undisturbed.
- **Request→approve→bill contract** (mirrors PT acquisition + reuses D1):
  - **Approve with a free spot** → `active` + `issue_invoice(class_registration, monthly, − discount)` + project enrollment + `class_approved`.
  - **Approve when full** → `waitlisted` + position, **no invoice** + `class_waitlisted`.
  - **Promote** (on a cancellation freeing a spot) → `active` + invoice + enrollment + `waitlist_promoted`.
- **Recurring billing seam:** B2 sets the registration as a **monthly recurring entity** (`start_date`/`end_date` = a month) and fires the **first** invoice. **D3 generates subsequent monthly invoices + expiry/overdue reminders** for both memberships and class registrations (B2 establishes the entity; D3 bills it on cadence).

## 6. To-be transactions (L3)
All notifications: sanctioned F2 pattern (authed action, recipient `profile_id`, RETURNING-free, guardian fan-out; FK→profiles now lets login-less members receive). Capacity/waitlist mutations are **atomic + row-locked** (no over-capacity / double-promote).

- **T1 Request** (origination): member requests (portal) or staff registers → `class_registrations` `requested`; **`class_requested`** → staff (`createNotificationForRole` owner+receptionist). Eligibility (age/belt/active class) enforced.
- **T2 Approve (+discount) / Reject:** staff approves with optional discount → capacity check (atomic): free → `active` + monthly invoice via `issue_invoice` + project enrollment + **`class_approved`** → member; full → `waitlisted` + position + **`class_waitlisted`**. Reject → `rejected` + reason.
- **T3 Capacity & Waitlist:** active registrations count vs `max_capacity`; waitlisted carry `waitlist_position` (FIFO).
- **T4 Cancel → auto-promote:** member/staff cancels (free) → `cancelled`, remove the enrollment, free the spot → **atomically auto-promote the lowest-position waitlisted** → `active` + invoice + enrollment + **`waitlist_promoted`** → that member. (Refund of an already-billed month = staff `refund_invoice`, reference-only, D1 — out of B2's automatic scope.)
- **T5 Recurring billing (seam to D3):** the active registration is monthly; **D3** issues the next month's invoice + expiry/overdue reminders. B2 just establishes the entity + the first invoice + the period.
- **T6 Attendance + member-visible status:** active registration → roster → attendance (B1, unchanged). Member sees their registrations + status (active/waitlisted #n/requested) + monthly fee in the portal.

## 7. Cross-portal propagation matrix
| Transaction | Member portal | Admin | Coach | Notifications |
|---|---|---|---|---|
| T1 Request | submit + "requested" | new request on class panel | — | `class_requested` → staff |
| T2 Approve | "active"/"waitlisted #n" | approve(+discount)/reject | roster gains student (if active) | `class_approved` / `class_waitlisted` → member |
| T4 Cancel/Promote | status updates | waitlist reorders | roster swaps | `waitlist_promoted` → promoted member |
| T5 Recurring | monthly invoice in billing | invoice issued (D3) | — | `invoice_issued` (D1/D3) |
| T6 Attend | (B1) | — | marks attendance | (B1 handoffs) |

## 8. Error recovery & edge cases
| # | Case | Behavior |
|---|---|---|
| E1 | **Duplicate request** | one open registration per (class, student); re-request while active/requested/waitlisted is rejected. |
| E2 | **Capacity race** (two approvals) | row-lock the class's active count; the loser goes to waitlist — never over `max_capacity`. |
| E3 | **Cancel→promote race** | atomic: free spot + promote lowest position in one txn; no double-promote, positions re-compacted. |
| E4 | **Approve when full** | → waitlisted (no invoice), not active. |
| E5 | **Bill only on active** | waitlisted members are **not** invoiced until promoted (pay when you get the spot). |
| E6 | **Discount bounds** | discount can't exceed the fee (floor 0); % in [0,100]; audited. |
| E7 | **Re-register after cancel** | allowed (a new registration); history retained. |
| E8 | **No gym membership** | allowed — class registration is **standalone** (independent product). |
| E9 | **Eligibility** | age/belt/active-class enforced at request + re-checked at approval. |
| E10 | **Expiry / non-renewal** | end_date lapses → `expired` (D3 reminders); expired frees the spot → auto-promote. |
| E11 | **Login-less member** | notifications now persist (FK→profiles); portal status visible once provisioned (A4) / via WhatsApp (G1). |
| E12 | **Partial failure** | the approve/promote (status + enrollment + invoice) is one transaction → roster, status, and billing never diverge. |

## 9. As-is → To-be + maturity
| Txn | As-is | Target | Gap |
|---|:--:|:--:|---|
| T1 Request | L0 | **L3** | portal request UI + `class_registrations` + `class_requested` |
| T2 Approve+Bill | L0 | **L3** | approve(+discount) RPC + `issue_invoice` + projection + notifs |
| T3/T4 Capacity+Waitlist | L0 | **L3** | atomic capacity + waitlist position + auto-promote (the benchmark table-stake) |
| T5 Recurring | L0 | **L3 (seam)** | establish monthly entity + first invoice; D3 bills the cadence |
| T6 Attend/visible | partial | **L3** | member-visible registration status (roster/attendance already work) |

**In scope:** class monthly pricing, `class_registrations` + status machine, `class_registration` invoice type, request/approve(+discount)/reject/cancel + atomic capacity/waitlist auto-promote RPCs, the enrollment projection, portal request+status UI, dashboard registrations/approve panel, the notifications, e2e in the ephemeral gym.
**Deferred:** weekly pass (V1.1), recurring monthly *generation* (D3), per-session drop-in (V2), online self-payment (V2).

## 10. Decisions — RESOLVED (2026-06-10)
Request→approve→bill (not auto) · `class_registrations` status+position waitlist · free cancel → auto-promote · **monthly-only** (weekly V1.1) · discount **% or fixed** · **standalone** (no membership required) · bill **on active transition** · attendance roster stays `class_enrollments` (B1 undisturbed) · recurring generation is **D3**.

## 11. Rebuild-slice definition (seeds the prompt)
- **Migrations:** `classes.monthly_fee_usd/lbp`; `class_registrations` table + status enum + RLS (member sees own; staff manage in-gym); `invoice_type_enum += class_registration`; RPCs `request_class_registration` (or member insert via RLS), `approve_class_registration(p_reg, p_discount_*)` (atomic capacity → active+invoice OR waitlist), `cancel_class_registration` (free + atomic auto-promote), all staff/owner-gated where appropriate; the `active⇒class_enrollments` projection.
- **UI:** portal/classes browse + request + status (Arabic-RTL); dashboard class registrations/approve(+discount)/waitlist panel; member portal status.
- **Notifications:** `class_requested`/`class_approved`/`class_waitlisted`/`waitlist_promoted` + `invoice_issued` (reuse D1); i18n ar/en/fr; no MISSING_MESSAGE.
- **Behavior-green e2e** (ephemeral gym, TI helpers): request → `class_requested`; approve (free) → active + monthly invoice + roster + `class_approved`; approve (full) → waitlisted; cancel active → auto-promote next → active + invoice + `waitlist_promoted`; member sees status; capacity never exceeded. Strategic-context block + F2 hygiene + dev-port-3000 + no-trailer + drag read.

---

*Awaiting sign-off. On approval I write the B2 prompt. Note the seam: B2 establishes the recurring class-registration entity + first invoice; **D3** (later) generates the monthly cadence + reminders for both memberships and class registrations.*
