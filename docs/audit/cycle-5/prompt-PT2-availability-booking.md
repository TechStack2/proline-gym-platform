# CODER PROMPT PT-2 — Signature PT booking: coach availability, slot engine, instant-book + propose-a-time

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after E1 merges (branch `prompt-pt2-booking` off post-E1 `main`). Design (operator-approved "Calendly-class" mandate): [`../journey-pt-360.md`](../journey-pt-360.md) §4. PT-1 (catalog/sale/refill) is merged — build on it.

## Strategic context
The operator's signature-feature mandate: kill the WhatsApp ping-pong around PT times. Calendly's two moves, gym-policy-bounded: **only genuinely free slots are offered, and picking one books it.** Coaches keep control by publishing only what they'll teach; the desk always has the last word (override). This is the platform's clearest white-label differentiator — no Lebanese boutique gym has self-service PT booking.

## Build

### 1. Migrations (next free numbers)
- **`coach_availability`** (gym-scoped): coach_id, day_of_week, start_time, end_time, is_active — recurring weekly windows. **`coach_availability_overrides`**: coach_id, date, kind (`block` | `extra`), start/end time nullable for full-day block. RLS: coach manages own rows; staff manage any in gym; authenticated-read in gym (members need slot visibility); NO anon.
- **Gym policy columns** (C1 pattern): `pt_slot_minutes` (60) · `pt_min_notice_hours` (12) · `pt_booking_horizon_days` (14) · `pt_buffer_minutes` (0).
- **`book_pt_session` RPC** (atomic, SECURITY DEFINER, REVOKE FROM PUBLIC — the house idiom). Guards in ONE transaction: active non-expired package of the caller (member path) or of the named member (staff path, `is_staff()`); **anti-overbook**: bookable = sessions_remaining − already-booked-not-completed > 0 (lock the assignment `FOR UPDATE`); slot date inside package validity; **overlap check on the coach's sessions under `FOR UPDATE`** (the race loser gets a clean "slot taken"); member path additionally enforces: inside published availability (windows minus overrides), ≥ min-notice, ≤ horizon, aligned to slot granularity; **staff path may override availability/notice** (flag param) — the IA-3 conflict warning still shows client-side. Writes the `pt_sessions` row (scheduled, concrete timestamptz) → best-effort notifications both sides.
- **Propose-a-time** (the bounded fallback): verify the real `pt_sessions` status enum; add a `proposed` state (+ `proposed_by`) if absent. `respond_pt_proposal` RPC: accept → books through the same guards; counter (new time) → flips the ball with a notification; decline → cancelled+notified. ONE round-trip by design.
- **Member cancel**: reuse/extend the C1 cancel policy (gym-configurable window) for member-initiated cancel of a *scheduled* booking — frees the slot, credit untouched (it was never spent — C1's writer untouched). Reschedule = cancel+rebook client-side.

### 2. Slot engine (read-side, **gym timezone**)
Compute bookable slots for a coach: availability windows − overrides − class slots (day_of_week) − booked/proposed PT − policy bounds, **in `gyms.timezone`** (finally used — fixes the IA-3 server-clock caveat for booking; don't rewrite IA-3's diary rendering). Server-side function (RPC or server util) so portal/staff/coach all share ONE implementation.

### 3. Surfaces
- **Coach app — availability editor** (UX-1 conventions): weekly day-pills + time ranges, date overrides (block a day / add a one-off window); their upcoming booked sessions list.
- **Member portal** — on the PT-1 package card: **"Book a session"** → next free slots (horizon window, grouped by day, tap = instant book) → confirmation + bell; **"Propose a time"** fallback when nothing fits (date+time picker → proposal); cancel within policy from the upcoming list.
- **Staff** — same slot picker from the Member-360 PT panel and the IA-3 diary (+ override toggle, conflict warning intact); proposals land in the **Inbox** (accept / counter / decline) for staff AND in the coach app for the assigned coach.
- **Today** — today's PT card already exists; booked sessions appear automatically (verify, don't rebuild).

### 4. Scope guards
No group/class booking; no payment coupling (credits reserve, completion spends — C1 single writer untouched); no calendar exports (V2); no member-to-member visibility. i18n ar/en/fr, RTL, tenant-clean.

## Verify (e2e, ephemeral TI gym)
1. **Publish + book:** coach publishes Tue–Sat windows (or seeded) → member with the PT-1 package sees only free, policy-bounded slots (assert a <min-notice slot is absent) → taps one → **booked instantly**; lands in coach app + IA-3 diary + portal upcoming + Today; both bells fire.
2. **Race:** two contexts book the same slot → exactly one wins, loser gets the clean "slot taken" and fresh slots.
3. **Anti-overbook:** with 2 credits and 2 booked-not-completed sessions, a third booking is rejected.
4. **Propose-a-time:** member proposes an out-of-window time → Inbox + coach see it → counter → member accepts the counter → booked through the same guards.
5. **Cancel:** member cancels outside the policy window cleanly (slot frees, credits untouched); inside-window path follows the C1 policy.
6. **Staff override:** desk books outside availability with the warning shown — succeeds.
7. Full suite green — no regression (E1's count +2-3 PT-2 tests).

## Acceptance
1. The seven proofs green in E2E CI (run ID/URL).
2. `database-reviewer`: availability RLS (coach-own/staff-gym/no-anon), both RPCs guarded + REVOKEd, overlap + anti-overbook under locks, C1 credit writer untouched (diff is the proof).
3. ONE slot-engine implementation shared by all three surfaces; computed in gym tz.
4. i18n complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-pt2-booking` off post-E1 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations via Verify-Foundation (`-f apply=true -f migrations=…`) before e2e; stay on your branch. The parallel I18N-1 slice owns ONLY the three i18n JSONs — your new keys will merge additively; otherwise no shared surface.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / PT-2 — Availability booking`: the availability model, slot-engine design (tz handling), RPC guards, proposal lifecycle, CI run ID/URL, an explicit **"Instant-book + race-safe + anti-overbook + propose-a-time round-trip: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **ML-1 (membership lifecycle — D2+D3 combined; design forks go to the operator while you build this)**.

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms E1 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-pt2-booking off main (git checkout main && git pull && git checkout -b prompt-pt2-booking
— main must contain E1; verify register_camp exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-PT2-availability-booking.md
design: docs/audit/journey-pt-360.md §4 (operator-approved Calendly-class mandate)

Kill the WhatsApp ping-pong: only genuinely free slots are offered, and picking one BOOKS it. Coaches
control via published availability; the desk can override. The parallel I18N-1 slice owns only the three
i18n JSONs (additive merges); no other shared surface.
Do: (1) MIGRATIONS (next free numbers): coach_availability (recurring weekly windows) +
coach_availability_overrides (date block/extra) with coach-own/staff-gym/authenticated-read-in-gym RLS,
NO anon; gym policy cols pt_slot_minutes(60)/pt_min_notice_hours(12)/pt_booking_horizon_days(14)/
pt_buffer_minutes(0); book_pt_session atomic SECURITY DEFINER RPC (REVOKE FROM PUBLIC): member-or-staff
path guards in ONE txn — active non-expired package, ANTI-OVERBOOK (remaining − booked-not-completed >
0, assignment FOR UPDATE), slot inside validity, coach overlap under FOR UPDATE (race loser gets clean
"slot taken"), member-only availability/min-notice/horizon/granularity checks, staff override flag
(client keeps the IA-3 conflict warning) → scheduled pt_sessions row (timestamptz) → notifications both
sides; propose-a-time: verify the real pt_sessions status enum, add 'proposed' (+proposed_by) if absent,
respond_pt_proposal RPC (accept→books via same guards / counter→flips with notification / decline);
member cancel of scheduled bookings per the C1 gym-policy window (frees slot, credits untouched —
complete_pt_session stays the ONLY credit writer; the diff must prove it untouched beyond PT-1's
guards). (2) SLOT ENGINE (read-side, ONE shared server implementation, computed in gyms.timezone —
finally used): windows − overrides − class slots − booked/proposed PT − policy bounds. (3) SURFACES:
coach app availability editor (day pills + ranges + date overrides) + upcoming list; member portal
package card "Book a session" (grouped free slots, tap = instant book) + "Propose a time" fallback +
policy-window cancel; staff slot picker on Member-360 PT panel + IA-3 diary with override toggle;
proposals → Inbox (accept/counter/decline) + coach app; Today's PT card picks bookings up automatically
(verify, don't rebuild). (4) No group booking, no payment coupling, no calendar export, no member-to-
member visibility. i18n ar/en/fr, RTL, tenant-clean.
Verify in the E2E CI run, not tsc: publish windows → member sees only free policy-bounded slots
(<min-notice absent) → instant book lands in coach app + diary + portal + Today with both bells; same-
slot race → exactly one winner, clean loser message; anti-overbook (2 credits + 2 booked → 3rd
rejected); propose → counter → accept → booked; member cancel outside window frees slot with credits
untouched; staff override books outside availability with warning; FULL suite green (no regression).
Apply migrations via Verify-Foundation with -f apply=true -f migrations=… BEFORE e2e. If the sandbox
can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000;
scoped git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your
branch (auditor docs may land on main — don't rebase mid-run; report divergence).
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / PT-2 — Availability booking": the
availability model, slot-engine tz design, RPC guards, proposal lifecycle, CI run ID/URL, an explicit
"Instant-book + race-safe + anti-overbook + propose-a-time round-trip: PASS/FAIL" line, and a DRAG
READ. Then STOP and tell me PT-2 is ready for review.
```
