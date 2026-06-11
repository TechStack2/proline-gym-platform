# Journey: PT-360 — package sale → availability booking → delivery → refill (signature feature)

> **Auditor design, 2026-06-11.** Operator mandate: PT is a gym's revenue core and is under-designed — master it 360° (marketing → sale → allocation → scheduling → delivery → refill). Forks LOCKED: **package catalog (gym-scoped SSOT)** · **configurable refill thresholds → Inbox + member nudge** · **hard expire + staff extend**. Scheduling: operator asked for a **Calendly-class booking experience** — proposal in §4 (awaiting sign-off). Implementation: two slices (§7) after B3.

## 1. What exists (verified green)
- **Sale (22R):** portal request → staff approve → invoice (D1). Missing: staff desk sale, package catalog, landing presence.
- **Delivery (C1):** schedule → deliver lifecycle; `complete_pt_session` is the ONLY credit writer; no-show/cancel per gym-configurable policy. Missing: booking at a chosen future date/time.
- **Visibility (IA-3):** coach day-diary shows PT blocks + conflict warning. **Money/Member-360 (IA-2):** credits remaining/total + validity render live.

## 2. Origination (channel-complete — how a PT sale starts)
- **A. Desk sale (primary, MISSING):** staff sell a package from the catalog directly on Member-360 (member exists) or right after lead-conversion/member-creation → invoice (D1) → assignment.
- **B. Portal request (exists, 22R):** member requests; staff approve → invoice. Upgrade: request now picks from the catalog.
- **C. Landing (MISSING):** PT section markets package types (`show_on_landing` per type — ADM-1 pattern) + per-coach "Private sessions" presence → trial/inquiry CTA → lead pipeline (23R).
- **D. Refill re-sale (MISSING):** threshold trigger → staff Inbox "renewal due" → one-tap re-sale of the same type (§5).

## 3. Catalog + sale + allocation
- **`pt_package_types`** (gym-scoped, Settings CRUD like disciplines): name (ar/en/fr), `sessions_count`, `price_usd/lbp`, `validity_days`, optional `discipline_id`, `is_active`, `show_on_landing`. Tenant data — Proline enters 5/8/10/12-packs; white-label gyms enter their own.
- **Sale** (desk or approved request): pick type → pick coach (chips; filtered by specialty if the type has a discipline) → optional price override (the existing discount discipline: % / fixed, manual) → `sell_pt_package` atomic RPC (guards → package row from the type snapshot [sessions, validity from sale date] → assignment → invoice via `issue_invoice` [payer = guardian for minors, B3] → notification). Type fields are SNAPSHOTTED onto the package at sale — later catalog edits never mutate sold packages.
- **Allocation:** package binds to ONE coach at sale (matches reality); staff may reassign (audited; future sessions move with it or get rebooked).

### 3.1 Package-centric presentation (operator amendment, 2026-06-12 — APPROVED with this addition)
The current portal/admin PT surfaces render a **flat list of loose "single PT sessions"** with no tie to discipline, coach, when-used, or which package — the operator hit this on Karim's account. PT-1 must restructure EVERY PT surface package-first:
- **The package card is the unit of display** (portal "My PT", Member-360 PT panel, coach roster): type name · coach · discipline · **X of Y remaining** · validity window with countdown · status (active/expired/frozen) · **its invoice + payment state (the billing tie — deep-link to the invoice/receipt)**.
- **Sessions nest UNDER their package card** as history rows (date, outcome: completed/no-show/late-cancel, booked-upcoming) — never a flat sibling list. A session is meaningless without its package.
- Loose legacy "Single PT Session" requests/sessions in the demo gym are accumulated test residue — archive them during PT-1 (data cleanup, not schema); any truly package-less session rows surface in a one-time "unlinked" admin notice for staff to resolve.

## 4. Signature scheduling — "Calendly for the gym" (PROPOSAL)
**Goal: minimize back-and-forth.** Calendly kills negotiation with two moves: (1) only genuinely free slots are offered, (2) picking one BOOKS it. We adopt both, gym-policy-bounded:

- **`coach_availability`:** recurring weekly windows per coach (e.g., Tue 16:00–20:00) + date overrides (block a day / add a one-off window). Coach edits in the coach app (day-pill + time-range UI, UX-1 conventions); staff can edit on a coach's behalf. Nothing is bookable outside published windows — *coaches keep control by only publishing what they'll teach.*
- **Slot engine (read-side):** bookable slots = availability windows − class slots (day_of_week) − booked PT − gym policy: `slot granularity` (default 60min), `min notice` (default 12h), `booking horizon` (default 14 days), optional `buffer` (default 0). All computed in the **gym's timezone** (`gyms.timezone`, currently unused — this slice puts it to work; fixes the IA-3 server-clock caveat).
- **Member instant-book:** portal → my package (active, credits available) → "Book a session" → assigned coach's next free slots → tap → **booked** (atomic RPC: `FOR UPDATE` on overlapping sessions; unique (coach, start) guard — the race loser gets "slot taken" + fresh slots). Both sides notified; lands in diary/Today/coach app/portal.
  - **Anti-overbook rule:** bookable count = credits remaining − already-booked-not-yet-completed sessions. (Credits still only DECREMENT on completion — C1's single-writer rule untouched; booking is a reservation, not a spend.)
  - **Validity rule:** the slot date must fall inside the package validity window.
- **Negotiation fallback (the only async path):** "None of these work → propose a time" → member proposes → staff/coach Inbox → accept (books it) or counter (member gets a notification with the counter-slot, one tap to accept). Bounded to one round-trip in-app instead of twenty WhatsApp messages.
- **Staff/coach booking:** same slot picker from Member-360 / the diary / coach app (walk-ins + phone callers); staff may **override** outside availability (with the IA-3 conflict warning) — the desk always has the last word.
- **Reschedule/cancel:** member self-cancel within the C1 gym-policy window (frees slot; credit untouched — it was never spent); inside the window → C1 late-cancel policy applies. Reschedule = cancel + rebook in one action.
- **Edge cases:** coach deactivated (ADM-1 warning lists future bookings → staff rebook/reassign); package expires before a booked date (booking blocked at validity edge; expiry freeze cancels future sessions with notification); DST (Lebanon EET↔EEST — compute in gym tz, store timestamptz); availability shrink with existing bookings (bookings stand; only future offering shrinks).

## 5. Refill / renewal (locked fork)
Gym-policy thresholds (defaults: **≤2 sessions remaining** OR **≤7 days to expiry**) →
1. **Staff Inbox** "PT renewal due" item (member, package type, remaining/expiry) with one-tap **re-sell same type** (→ §3 sale flow).
2. **Member notification** ("2 sessions left — renew at the desk") via the sanctioned F2 pattern.
Trigger evaluation: on each `complete_pt_session` (credit edge) + a daily check for the expiry edge (same mechanism D3 dunning will use — build once, share).

## 6. Expiry (locked fork)
On validity end with unused credits: package → `expired` (frozen, not deleted); scheduling/completion blocked; future booked sessions auto-cancelled with notifications; Member-360 shows frozen credits + **Extend validity** staff action (one tap, audited) — goodwill stays human, the system enforces the default.

## 7. Implementation plan (after B3)
- **PT-1 — Catalog, desk sale, refill, expiry:** `pt_package_types` + Settings CRUD + landing PT section; `sell_pt_package` RPC + desk sale UI + portal request upgraded to catalog; thresholds → Inbox/nudge; expiry freeze + extend. (Sale→refill→expiry loop closed.)
- **PT-2 — Signature booking:** `coach_availability` + coach editor; slot engine (gym tz); member instant-book + propose-a-time fallback; staff/coach picker + override; reschedule/cancel per policy; diary integration. (The Calendly moment.)
Then the V1 punch-list resumes: D2 → D3 → F3 → G1 → E1 → G2.

## 8. Maturity note
This takes PT from L2 (transactions work) toward L3/L4 (the system manages the workflow: it offers, books, reminds, and re-sells). It is also the platform's clearest differentiator for the white-label pitch — no Lebanese boutique gym has self-service PT booking today.
