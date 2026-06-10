# Phase 1 Exit — Portal Re-Score & Closure

> **Created:** 2026-06-10 · **Auditor:** Project Auditor · **Gate:** Phase 1 (Foundation + Connective Tissue) complete. Re-scores Portals A–D vs [industry-benchmark.md](../industry-benchmark.md) after the Phase-1 slices, confirms what closed, and reconciles the remainder against the locked [V1 scope](../v1-market-readiness-scope.md).

## What Phase 1 delivered (all behavior-green, merged)
Foundation (F1/F1.1) · notification producer layer + read path (21/F2) · **A1** Lead→Active-Member · **B1** Member Activity Loop · **C1** PT Session Delivery · **D1** Billing & Payment · **TI** ephemeral-gym (deterministic suite).

## Portal re-score (benchmark 0–5; before → after Phase 1)

| Portal | Before | After | What moved | What still gates it |
|---|:--:|:--:|---|---|
| **A — Marketing** | ~1.1 | ~2.0 | lead capture 2→3 (web+staff origination, `lead_new`); trial 1→3 (persists + coach handoff); convert/onboard 0→3 (atomic member+membership+invoice) | self-serve signup/booking still 0 (**V2**) |
| **B — Member** | ~1.2 | ~1.9 | visible progress 1→3 (`/portal/progress`); PT visibility 0→3; billing visibility held 3 | **self-booking/waitlist 0 (B2)**, **family 1 (B3)** — the V1 must-haves |
| **C — Coach** | ~1.2 | ~2.4 | PT roster+logging 0→4 (22-R+C1, atomic credit); belt promote→atomic (held 4); eligibility hint 1→L4 (read-only); attendance held 4 | assessments/curriculum 1/0, subs/messaging 0 (**V2/P3**) |
| **D — Admin** | ~2.3 | ~3.0 | lead pipeline 2→3 (real convert); billing reconcile 1→3 (D1, sum-based atomic); issuance unified (`issue_invoice`); belt engine held 4 | **comms delivery** (in-app producers exist, but WhatsApp/login-less delivery pending — G1/FK); **renewal/dunning 1 (D3)**; analytics 2 (**V2**); admin UI husks |

**Headline:** every portal's **core flows reached L3 Managed** — the connective tissue (notifications + working handoffs + atomic money/credit/promotion) is in. The remaining lifts are exactly the **V1 must-have set** (member self-service, family, comms *delivery*, renewal reminders), not foundation work.

## Notification-type producer coverage (Phase-1 goal)
Every Phase-1 `notification.type` now has a producer: `lead_new/trial_scheduled/lead_converted` (A1), `enrollment_confirmed/attendance_absent/belt_promoted` (B1), `pt_session_scheduled/completed/cancelled/no_show/pt_credits_exhausted` (C1), `invoice_issued/payment_received` (D1), `pt_requested/approved/assigned` (22-R). **Caveat:** delivery to **login-less members is silently dropped** (the `user_id`→`auth.users` FK) — the #1 remaining foundation gap, and V1 slice #1.

## Carried debts (logged, scheduled into V1)
- 🔴 **Notification FK** → login-less members can't receive (V1 #1, FK-fix next).
- 🟠 **Admin presentation DOA cluster** — `/invoices` repaired in D1; **classes list/detail/enroll + students search** remain (V1 admin-UI repairs).
- 🟡 **D1 residue** — legacy `/payments` list + invoice-list/stats/filter husks (unused, type-green; ~20-min delete/rebuild); duplicate-reference dedup is a client-side `confirm()` (move into `record_payment` if a second writer ever appears). Fold into the admin-UI repair slice.
- 🟡 Test-infra: dedicated test *project* would unlock `workers>1` later.

## Gate verdict
**Phase 1 PASS.** Foundation + connective tissue complete and behavior-green on a now-deterministic suite. The strangler thesis held across 4 journeys + the test-infra investment (the flakiness tax is gone). **Proceed to the V1 remainder** ([v1-market-readiness-scope.md](../v1-market-readiness-scope.md)), starting with the **FK-fix** (so member-facing comms can actually land before B2/B3/D3/G1 pile on more producers).

*Phase-ordering note:* the locked V1 is engagement-first (B2/B3 before the growth/marketing funnel, which is V2). No reorder unless filling classes becomes the urgent business pain — flag at the V1 readiness review.
