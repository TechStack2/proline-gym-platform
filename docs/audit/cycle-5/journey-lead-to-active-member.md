# Journey Design — Lead → Onboard → Active Member

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only — design, not code)
> **Status:** DESIGN — awaiting sign-off before the rebuild prompt is issued.
> **Relationship to other docs:** [`cross-portal-workflow-map.md`](../cross-portal-workflow-map.md) is the *skeleton* (one row: "Lead (inbound)"). **This document is the full anatomy of that one row** — every transaction, state, actor, write, notification, and cross-portal propagation, as-is vs to-be.
> **Method:** the as-is is **verified against the current code + schema** (file:line / migration:line cited), not assumed. The to-be targets **L3 Managed**.

---

## 0. Why this journey, why now (strategic context)

**Strangler decision (pre-session):** we are NOT rewriting the platform. The base is sound (schema, RLS, identity foundation, behavior-green CI, two proven slices). The missing ingredient is **user-journey / workflow design** — which a rewrite would not fix. So we design the journey first, then rebuild *this one slice* cleanly on the current base, and **measure the drag** (clean like 22-R/F2, or a slog against legacy cruft?). That single data point decides strangle-vs-rewrite. If we ever do rewrite, this design transfers wholesale.

**Benchmark gaps this journey closes** ([`industry-benchmark.md`](../industry-benchmark.md), Portal A — Marketing):

| Capability | Score now | This journey takes it to |
|---|---|---|
| Lead capture form | **2/5** "Behind" (name+phone only, no auto-follow-up) | source-tagged capture **+ instant staff notification** → L3 |
| Intro-offer / trial funnel | **1/5** "Behind" ("call/WhatsApp us"; no booking) | a **persisted trial** (date/time/coach) with coach handoff → L3 |
| Online signup & purchase | **0/5** "Behind" (no onboarding transaction) | **atomic convert → real member + membership + first invoice** → L3 |

It also closes the single worst cross-portal break in the platform: **a "converted" lead today becomes nothing** — no student, no membership, no invoice, no propagation. The headline Portal-A gap ("no self-serve funnel from interested → booked trial → member; every conversion requires manual staff entry") is exactly this journey.

**Roadmap placement** ([`platform-elevation-roadmap.md`](../platform-elevation-roadmap.md)): **Phase 1 — Connective Tissue.** This is TRACK B (the deferred Prompt 23), now rebuilt as a single sequential vertical slice instead of a parallel mission. Acquisition *polish* (self-serve booking, e-sign, online purchase) stays in **Phase 5**; this slice only makes the **staff-driven** funnel real and Managed.

---

## 0.1 Design principle — every journey begins at ORIGINATION (reusable rule)

> **A journey map is incomplete until it enumerates every way its root entity enters the system — not just the happy-path channel.** Origination is a *layer*, not a single event, and it has three mechanisms:
> 1. **Self-serve** — the actor submits themselves (anon / public).
> 2. **Staff-manual** — a staff member records an entity that arrived through an offline or messaging channel.
> 3. **Automated-inbound** — an integration auto-creates the entity from an external event (webhook, API, scheduled import).
>
> **All future journey maps in this audit MUST open with an Origination section** that lists each real-world channel, which of the three mechanisms handles it, and whether a surface exists. Omitting it is exactly the gap this amendment fixes: the original draft started at "capture" and silently assumed every lead arrives via the website form — when the `leads.source` enum models **eight** channels and the table default is `'walk_in'`.

---

## 1. Journey at a glance

```
  ORIGINATION (T1)            LEAD              PROSPECT             MEMBER
  how the lead enters     (in pipeline)      (trialed)          (active, billed)

  ┌─ self-serve ──────┐
  │ website CTA form  │──┐ source=website        T3 trial      T5 convert→onboard
  └───────────────────┘  │                          │                  │
  ┌─ staff-manual ────┐  ▼  T2 triage   ┌──────────┐│   ┌────────────────────────┐
  │ walk_in · phone   │─▶┌──────┐ contact│ TRIAL_   ││──▶│ CONVERTED              │
  │ instagram · fb    │  │ NEW  │───────▶│ SCHEDULED│┘T4 │ profile+student+       │
  │ whatsapp·referral │─▶│      │        └──────────┘    │ membership+invoice +   │
  └───────────────────┘  └──────┘   show/no_show         │ (sim) login invite     │
  ┌─ automated-inbound┐     │  │           │             └───────────┬────────────┘
  │ WA/IG webhook,    │··▶  │  ▼ lost      ▼ lost/no-convert          ▼ T6
  │ member referral   │     │ ┌──────┐                       propagates to:
  │ (DEFERRED P5/P6)  │·····┘ │ LOST │              admin roster·billing·coach roster·portal·bell
  └───────────────────┘       └──────┘
  every origination ⇒ lead_new → staff
```

**Happy path:** T1 → T2 → T3 → T4(show) → T5 → T6.
**Branches:** lost at any stage; trial no-show (T4); **walk-in convert without a trial** (T2→T5 directly); parent-of-minor (one parent profile → child student).

The existing `lead_status_enum` already models the spine: `new · contacted · trial_scheduled · trial_completed · converted · lost` ([000001:79-81](../../supabase/migrations/000001_create_enums.sql#L79-L81)). Today only the *string* moves; nothing else does.

---

## 2. The cast & the surfaces

| Actor | Role in journey | Portal surface |
|---|---|---|
| **Visitor (stranger)** | self-submits interest (origination, web) | Landing — `TrialCTASection` ([component](../../src/components/marketing/TrialCTASection.tsx)) |
| **Reception / Owner** | **logs offline/messaging leads (origination, manual)**, triages, schedules trial, runs convert | Admin — `(dashboard)/leads` ([page](../../src/app/[locale]/(dashboard)/leads/page.tsx)) — **needs a NEW "Add Lead" surface** |
| **Integration (future)** | auto-creates leads from WhatsApp/Instagram inbound; member referral | Webhook / member portal — **DEFERRED (Phase 5/6)** |
| **Coach** | delivers the trial, records outcome | Coach — trial roster (NEW surface) + records show/no-show |
| **New member / parent** | receives invite, eventually logs in | Student portal (login-less at first → simulated invite → activated) |
| **System (notifications)** | pings the next actor at each handoff | Bell + `/notifications` (sanctioned producer pattern) |

---

## 3. As-is teardown (verified — the rip-out list)

Each transaction, what the code *actually* does today, and its maturity level.

### T1 — Origination · **L1 (one channel only; staff-manual entry absent)**
**The only way a lead enters the system today is the website form.** Verified: the *sole* write into `leads` anywhere in `src` + `supabase` is `submit_public_lead`. Eight `source` channels are modeled but seven have no entry surface.

- **Self-serve (website):** `TrialCTASection` collects `name`, `phone`, `program` and calls `submit_public_lead(p_first_name, p_phone, p_source='website', p_notes=program)` ([TrialCTASection.tsx:45-50](../../src/components/marketing/TrialCTASection.tsx#L45-L50)). The RPC (SECURITY DEFINER, `anon`+`authenticated`) picks **the first active gym** and inserts `status='new'` ([000009:8-37](../../supabase/migrations/000009_public_lead_submissions.sql#L8-L37)). Persists (L2) **but no `lead_new` notification** — the UI's "we'll WhatsApp you within 24h" is a promise nothing keeps; `program` is dumped into `notes` (the `interested_discipline_id` FK is never set — [000003:397](../../supabase/migrations/000003_create_operational_tables.sql#L397)); `last_name`/`email` not captured.
- **Staff-manual (walk_in · phone · instagram · facebook · whatsapp · referral · other): ABSENT (L0).** There is **no "Add Lead" button or form** in the admin board — `leads-client.tsx` only renders + filters existing leads and changes status; it never inserts. So reception **cannot log a walk-in, a phone enquiry, an Instagram/WhatsApp DM, or a referral** — even though `leads.source` defaults to `'walk_in'` ([000003:395](../../supabase/migrations/000003_create_operational_tables.sql#L395)), implying the schema *expects* manual entry that no surface provides. For a Lebanese gym these offline/messaging channels are the **dominant** origination path, so the platform is blind to most of its real leads.
- **Automated-inbound:** none (no WhatsApp/Instagram webhook; no member-referral surface). Deferred — but the design must leave room.

### T2 — Triage / Contact · **L1 (cosmetic)**
- Admin board: `page.tsx` server-fetches gym-scoped leads + per-status counts; `leads-client.tsx` renders cards with a status `<select>`.
- Status change = a single `.update({ status })` on `leads` ([leads-client.tsx:148-151](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx#L148-L151)). Optimistic UI, toast, gym-scoped. That is the entire behavior. No contact log, no assignment, no notification.

### T3 — Schedule Trial · **L1 (pure cosmetic — the worst stub)**
- Expanding a card reveals a `<input type="date">` and a time `<select>` — **both wired to nothing** (no state, no handler) ([leads-client.tsx:320-333](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx#L320-L333)).
- "Confirm trial" calls `handleStatusChange(lead.id, 'trial_scheduled')` ([:336-339](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx#L336-L339)) — it flips the status string and discards the date/time.
- **No `trial_classes` row is ever written** anywhere in `src` (verified: zero `trial_classes` writes in the codebase). No coach is notified. The trial does not exist.

### T4 — Trial Outcome · **absent (L0)**
- No surface anywhere records show-up/result. `trial_classes.show_up` / `status` / `feedback` columns exist ([000003:415-417](../../supabase/migrations/000003_create_operational_tables.sql#L415-L417)) but are never written. The `trial_completed` lead status is selectable but means nothing.

### T5 — Convert → Onboard · **L1 (cosmetic — the critical break)**
- "Convert" button → `handleStatusChange(lead.id, 'converted')`, which `.update`s `status='converted'` + `converted_at` ([leads-client.tsx:142-151, 301-311](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx#L301-L311)).
- **Nothing else.** No `profiles`, no `students`, no `student_memberships`, no `invoices`. `leads.converted_student_id` (FK to `students`, exists at [000003:401](../../supabase/migrations/000003_create_operational_tables.sql#L401)) is **never set**. No notification. The "member" does not exist in any other portal.

### T6 — First Active State · **absent (L0)**
- Because T5 creates nothing, there is no propagation: the converted lead never appears as a student, never has a membership/invoice, never shows on a coach roster, never has a portal. The journey dead-ends at a string.

**Verdict:** origination is single-channel (website only; staff-manual entry absent); **everything from triage downstream is L1/L0 cosmetic**. This is the DeepSeek-stub anatomy to replace.

---

## 4. The data spine (verified schema)

The journey reads/writes these tables. Bold = the chain the rebuild must make real.

```
leads ──(convert)──▶ profiles ──1:1──▶ students ──▶ student_memberships ──▶ invoices
  │                    (login-less ok)                   │ plan_id              │ membership_id
  └──(trial)──▶ trial_classes                            └─▶ membership_plans   └─▶ (TVA + number triggers)
                                          notifications (recipient = profile_id)
```

| Table | Key columns for this journey | Notes / source |
|---|---|---|
| `leads` | `status`, `source`, `interested_discipline_id`, `assigned_to`, **`converted_student_id`**, `converted_at` | [000003:388-405](../../supabase/migrations/000003_create_operational_tables.sql#L388-L405) |
| `trial_classes` | `lead_id`, **`class_id NOT NULL`**, `scheduled_date`, `status`, `show_up`, `feedback` | **No time-of-day, no coach column** ([000003:410-420](../../supabase/migrations/000003_create_operational_tables.sql#L410-L420)) → migration needed (§6 T3) |
| `profiles` | `id` (**FK to auth.users DROPPED in 000018**; default `gen_random_uuid()`), `gym_id`, `first_name_*`, `last_name_*`, `phone`, `gender`, `date_of_birth`, `locale` | [000002:38-57](../../supabase/migrations/000002_create_core_tables.sql#L38-L57) + [000018:24-26](../../supabase/migrations/000018_student_identity_write_path.sql#L24-L26) |
| `students` | `profile_id NOT NULL`, `gym_id`, `join_date`, `is_active`, `current_belt_rank` | [000002:91-103](../../supabase/migrations/000002_create_core_tables.sql#L91-L103) |
| `membership_plans` | `name_*`, `duration_days`, `price_usd`, `price_lbp`, `includes_pt`, `is_active` | [000003:91-109](../../supabase/migrations/000003_create_operational_tables.sql#L91-L109) |
| `student_memberships` | `student_id`, `plan_id`, `start_date`, `end_date`, `status` (default `active`) | [000003:114-122](../../supabase/migrations/000003_create_operational_tables.sql#L114-L122) |
| `invoices` | `gym_id`, `student_id`, `membership_id`, `invoice_type='membership'`, `amount_usd`, `exchange_rate`; **`total_usd`/`tax_amount_usd`/`invoice_number` auto-computed by triggers** | [000003:134-159](../../supabase/migrations/000003_create_operational_tables.sql#L134-L159); triggers `calculate_invoice_totals` + `generate_invoice_number` ([000005:173-217](../../supabase/migrations/000005_create_triggers.sql#L173-L217)) |
| `notifications` | `user_id`(=recipient `profile_id`), `gym_id`, `type`, `title_key`, `body_key`, `params` | producer RLS 000015; helper [create.ts](../../src/lib/notifications/create.ts) |

**The single most important schema fact (000018):** F1.1 **dropped `profiles.id`'s FK to `auth.users`** and set its default to `gen_random_uuid()`, *specifically so a gym-managed member can have a profile with no login* ([000018:8-26](../../supabase/migrations/000018_student_identity_write_path.sql#L8-L26)). The atomic, staff-only, gym-scoped **`create_student(...)`** RPC ([000018:30-89](../../supabase/migrations/000018_student_identity_write_path.sql#L30-L89)) already creates `profile + student` together. **Convert is `create_student` + membership + invoice + lead-link, in one transaction.** This is why the convert is *not* a big new build — it's an extension of a proven, existing write path.

---

## 5. The auth seam — "contained simulation" (the architectural centerpiece)

Per the design decision: **provision the login and "send" the auth, but as a contained simulation** — build the whole flow end-to-end for the demo, with a clean seam where the real API plugs in later.

Because of 000018, this is clean:

1. **The member is real and login-less from T5.** Convert creates `profiles` (`id = gen_random_uuid()`) + `students` + membership + invoice. The member exists everywhere **staff-facing** immediately (admin roster, billing, coach roster) with zero auth dependency.

2. **Provisioning is a separate, swappable adapter.** Define one seam — `AccountProvisioning` — with a single method conceptually `inviteMember(profileId, channel)`:
   - **`SimulatedProvisioning` (this slice):** generates an invite token, records an **"invite sent (simulated)"** state (a row / status the admin UI can show: *"Login invite pending"*), and emits the `lead_converted` notification to the member's `profile_id`. It performs **no external send and creates no `auth.users` row**. Fully deterministic → behavior-testable in CI with no external dependency.
   - **`RealProvisioning` (future, Phase 5/6):** swaps the body to call Supabase Auth invite (magic-link / phone OTP) and/or WhatsApp Cloud API, then **reconciles** the auth identity with the existing profile (create `auth.users` with `id = profiles.id`, or migrate the profile id) so portal RLS (`auth.uid() = profiles.id`) works.

3. **Why this is honest, not theater:** the *records* (member, membership, invoice, notification, lead link) are 100% real and propagate. Only the *credential delivery* is stubbed — and it is stubbed **behind a named interface**, not inline, so "plug the API" is a one-file change. The demo shows the complete journey including an "invite pending/sent" state; nothing pretends to send what it can't.

> **Scope guard:** the slice does NOT create real `auth.users`, does NOT send WhatsApp/email, and does NOT build the member's first login. It builds the seam + the simulated path + the visible "invite" state. Real send + login activation = a later prompt.

---

## 6. To-be transactions (L3 Managed)

For each: **Trigger · Writes · Notifies · Propagates · State-back · Acceptance.** All notifications use the **sanctioned F2 pattern**: call `createNotification` / `createNotificationForRole` ([create.ts](../../src/lib/notifications/create.ts)) directly from the staff Server Action with the action's authed client + recipient `profile_id`; RETURNING-free; RLS 000015 is the only guardrail; never add `.select()` to a producer insert.

### T1 — Origination (all channels)
A lead can enter via **three mechanisms**; all converge on a `leads` row `status='new'` with a correct `source`, and **all emit `lead_new` to staff**. This is the layer the original draft missed.

- **T1a Self-serve (website) — extend existing.**
  - **Trigger:** visitor submits the landing trial form (anon).
  - **Writes:** `submit_public_lead` extended to set `interested_discipline_id` (map the program select → a real discipline) and capture `last_name`/`email` if provided. `source='website'`, status `new`.
  - **Notifies:** **`lead_new`** → staff (see §10 fork 1: emitted inside the SECURITY DEFINER RPC since the caller is anon).
- **T1b Staff-manual (walk_in · phone · instagram · facebook · whatsapp · referral · other) — NEW surface, the key origination build.**
  - **Trigger:** reception clicks **"Add Lead"** on the admin board and enters name/phone + **source** (+ `source_detail` for referral/handle, + interested discipline, + notes).
  - **Writes:** authed staff INSERT into `leads` (gym-scoped via the caller's `gym_id`), `status='new'`, the chosen `source`. (Confirm/extend the `leads` INSERT RLS for staff; the existing board only reads/updates.)
  - **Notifies:** **`lead_new`** → staff via the **sanctioned authed pattern** (`createNotificationForRole(owner+receptionist)`) — fan-out so the whole front desk sees it, including whoever didn't enter it.
- **T1c Automated-inbound — DEFERRED (Phase 6 WhatsApp-native / Phase 5 referral).** WhatsApp/Instagram webhook auto-creating a lead, and a member-portal "refer a friend" surface. Out of this slice — but the `source` enum + `source_detail` already model it, so it drops on top with no schema change.
- **Propagates:** every origination path → the lead appears on the admin board with its source tag; staff bell increments live.
- **State-back:** none (entry point).
- **Acceptance:** (a) a public web submit and (b) a staff "Add Lead" each create a gym-scoped `leads` row with the correct `source` **and** a `lead_new` notification readable by staff only.

### T2 — Triage / Contact
- **Trigger:** staff changes status `new → contacted`, optionally assigns (`assigned_to`).
- **Writes:** `leads.status`, `assigned_to`. (Keep the existing optimistic-update path; just make assignment persist.)
- **Notifies:** none required at L3 (internal). *(Optional: notify the assigned staffer — defer.)*
- **Propagates:** board reflects status + owner.
- **Acceptance:** status + assignment persist and survive reload.

### T3 — Schedule Trial
- **Migration required** — `trial_classes` cannot model the chosen free-form trial today (no time, no coach, `class_id NOT NULL`). Add: `scheduled_time TIME`, `assigned_coach_id UUID REFERENCES coaches(id)`, and make `class_id` **nullable** (free-form trial not tied to a published class). Keep `lead_id`, `scheduled_date`, `status`, `show_up`, `feedback`.
- **Trigger:** staff picks date + time + coach in the (rebuilt, actually-wired) trial form.
- **Writes:** INSERT `trial_classes` (lead_id, scheduled_date, scheduled_time, assigned_coach_id, status `scheduled`); set `leads.status='trial_scheduled'`. Atomic.
- **Notifies:** **`trial_scheduled`** → the **assigned coach** (`createNotification`, recipient = coach `profile_id`); optionally a staff confirmation.
- **Propagates:** coach sees the trial on a **NEW coach "Trials" surface** (the trial roster); admin board shows scheduled date/time/coach.
- **State-back:** trial scheduled status visible on the lead card.
- **Acceptance:** confirming a trial writes a real `trial_classes` row with the chosen date/time/coach **and** notifies that coach; the coach sees it on their trials surface.

### T4 — Trial Outcome
- **Trigger:** coach (or reception) records the result after the trial.
- **Writes:** `trial_classes.status` → `completed` / `no_show` / `cancelled`, `show_up`, `feedback`; reflect to `leads.status` (`trial_completed` on show).
- **Notifies:** optional staff/coach reminder for follow-up (defer hard automation to Phase 4/5).
- **Propagates:** outcome visible to staff on the lead; **feeds T5** (a completed trial is the natural convert trigger).
- **Acceptance:** recording show/no-show persists on `trial_classes` and updates the lead; the outcome is visible to staff.

### T5 — Convert → Onboard (the critical atomic transaction)
- **Trigger:** staff clicks Convert and **selects a membership plan** (the gym's active `membership_plans`); confirms member details (prefilled from the lead).
- **Writes — ONE atomic transaction** (extend the `create_student` definer pattern into a new `convert_lead_to_member(p_lead_id, p_plan_id, …)` RPC, staff-only + gym-scoped):
  1. `profiles` (login-less, `gen_random_uuid()`) from lead data — name, phone, gender/dob if known.
  2. `students` (profile_id, gym_id, join_date, default belt rank).
  3. `student_memberships` (student_id, **plan_id**, start_date = today, end_date = today + `plan.duration_days`, status `active`).
  4. `invoices` (gym_id, student_id, membership_id, `invoice_type='membership'`, `amount_usd = plan.price_usd`, exchange_rate/rate_date) — **`total_usd`, `tax_amount_usd`, `invoice_number` auto-fill via the existing triggers** ([000005:173-217](../../supabase/migrations/000005_create_triggers.sql#L173-L217)).
  5. `leads.converted_student_id = <new student>`, `status='converted'`, `converted_at=now()`.
- **Notifies:** **`lead_converted`** → the new member's `profile_id` (exists; readable once login provisioned). Sanctioned pattern, RETURNING-free.
- **Provisioning seam:** invoke `SimulatedProvisioning.inviteMember(profileId)` → records "invite pending/sent (simulated)"; no external send, no `auth.users`.
- **Propagates (T6):** the new member appears on the **admin students roster**, in **billing** (the membership invoice, dual-currency), and is enrollable into classes/coach rosters.
- **State-back:** the lead card shows "Converted → [student]"; `converted_student_id` links the two.
- **Acceptance:** one Convert produces, **all-or-nothing**, a `profiles` + `students` + `student_memberships` + `invoices` row with the plan's price (TVA-correct total) + `leads.converted_student_id` set + a `lead_converted` notification + a simulated invite state. Partial failure rolls back the whole set.

### T6 — First Active State (propagation verification)
- Not a write — the **proof** that the slice is a real vertical slice. The new member must surface on: admin students list, admin billing (the invoice), and be visible/enrollable to a coach. This is asserted by the e2e spec, not assumed.

---

## 7. Cross-portal propagation matrix (this journey)

| Transaction | Admin (source) | Landing | Student portal | Coach | Notifications |
|---|---|---|---|---|---|
| T1a Origination (web) | new lead card (source-tagged) | form → success state | — | — | **`lead_new`** → staff |
| T1b Origination (manual) | **"Add Lead" form** → new card | — | — | — | **`lead_new`** → staff (fan-out) |
| T2 Triage | status + assignee | — | — | — | — |
| T3 Trial | scheduled date/time/coach on card | — | — | **NEW trials surface** shows it | **`trial_scheduled`** → coach |
| T4 Outcome | outcome on card; → convert | — | — | coach records show/no-show | (follow-up, deferred) |
| T5 Convert | member on roster; invoice in billing | — | (login-less; invite pending) | enrollable | **`lead_converted`** → member |
| T6 Active | roster + billing reflect member | — | visible once activated | roster | bell reflects |

"State flows back up" arrows that the rebuild must make real: **trial outcome → convert eligibility**, and **convert → student/membership/invoice visible across admin, billing, coach**.

---

## 8. Branch & edge paths

- **Lost** — any stage → `status='lost'`; no downstream writes. (Keep simple; nurture/win-back = Phase 4.)
- **Trial no-show (T4)** — `trial_classes.status='no_show'`, `show_up=false`; lead stays `trial_scheduled`/reverts to `contacted`; staff can reschedule or mark lost.
- **Walk-in convert (no trial)** — T2 → T5 directly; convert must not require a trial row. (Common in a real gym.)
- **Duplicate phone** — a lead phone may already match a student/lead. Recommend a soft warning at convert, not a hard block (defer dedupe enforcement). Flagged in §10.
- **Parent-of-minor** — one parent → child student. The 000018 profile model supports a login-less child profile; full family/household management is **Phase 2 (2B)** — this slice converts a single member and does not build household linking.

---

## 9. As-is → To-be gap + maturity ladder

| Transaction | As-is | Target | The gap to close | Benchmark cap |
|---|:--:|:--:|---|---|
| T1a Origination (web) | L2 | **L3** | emit `lead_new`; set discipline; capture last_name/email | Lead capture 2→3 |
| T1b Origination (manual) | **L0** | **L3** | NEW "Add Lead" surface (walk_in/phone/IG/FB/WA/referral); staff INSERT RLS; `lead_new` fan-out | Lead capture 2→3 |
| T2 Triage | L1 | **L3** | persist assignment (status already persists) | (CRM hygiene) |
| T3 Trial | L1 | **L3** | wire inputs; migrate `trial_classes`; write row; notify coach; coach trials surface | Intro-offer 1→3 |
| T4 Outcome | L0 | **L3** | record show/no-show/feedback; feed convert | Intro-offer funnel |
| T5 Convert | L1 | **L3** | atomic profile+student+membership+invoice+link; `lead_converted`; provisioning seam | Online signup 0→3 |
| T6 Active | L0 | **L3** | propagation proven across admin/billing/coach | (vertical-slice bar) |

**In scope for the rebuild slice:** T1–T6 to L3 as above — including **both origination paths** (extend the web RPC + a NEW staff "Add Lead" surface for the offline/messaging channels), the `trial_classes` migration, the `convert_lead_to_member` RPC, the coach trials surface, the simulated provisioning seam, and a new behavior-green e2e spec.

**Deliberately deferred (do not build; keep the contract extensible so they drop on top):**
- Self-serve trial **booking** from the landing calendar → **Phase 5 (5A)**.
- Online **self-signup + purchase** → **Phase 5 (5B)**.
- **E-sign waiver** at onboarding → **Phase 4/5** (the `documents`/waiver model exists but is out of scope).
- **Automated-inbound origination** (WhatsApp/Instagram webhook auto-creating leads; member-portal "refer a friend") → **Phase 5/6** (the `source` + `source_detail` columns already model it).
- **Real** auth/login activation + WhatsApp/OTP send → swap the provisioning adapter later (Phase 5/6).
- Family/household linking → **Phase 2 (2B)**.
- Lead **nurture / win-back / follow-up automation** → **Phase 4 (4A)**.

**Leapfrog lanes to respect (don't regress):** Arabic-first RTL on every new surface (trial form, convert modal, coach trials), dual-currency on the invoice, WhatsApp-friendliness (the provisioning seam is where WhatsApp-native plugs in).

---

## 10. Open decisions for the user (before the prompt)

The three structural forks (auth simulation / free-form trial / staff-picks-plan) are **decided**. These remaining choices are smaller but shape the prompt — I'll default as noted unless you say otherwise:

1. **`lead_new` emission path (T1):** the capture is an **anon** RPC, so it can't run the staff notification producer as the caller. Default: emit `lead_new` **inside `submit_public_lead`** (SECURITY DEFINER, already runs as `postgres`) via a direct insert — a sanctioned exception since there is no authenticated caller. Alternative: a thin authed re-emit. *Default = emit in the RPC.*
2. **Convert without a trial (walk-in):** allow Convert from any non-lost status (not gated on a trial row). *Default = allow.*
3. **Duplicate-phone at convert:** soft warning vs hard block. *Default = soft warning, no enforcement this slice.*
4. **Coach "Trials" surface placement:** a new tab in the coach portal (alongside attendance/PT). *Default = yes, minimal list view.*

---

## 11. Rebuild-slice definition (seeds the coder prompt — not the prompt itself)

**One sequential slice, on the current base. Rip out the cosmetic stubs (T2/T3/T5 in `leads-client.tsx`), implement journey-driven.**

- **Migrations:** staff INSERT RLS on `leads` (for manual Add-Lead); `trial_classes` columns (scheduled_time, assigned_coach_id, nullable class_id); `convert_lead_to_member(...)` RPC (atomic, staff-only, gym-scoped, extends `create_student`); `submit_public_lead` extension (`lead_new` + discipline mapping).
- **Server actions:** add-lead (manual origination), schedule-trial, record-trial-outcome, convert (call the RPC + emit `lead_converted` + provisioning seam) — all using the **sanctioned notification pattern**.
- **Provisioning seam:** `AccountProvisioning` interface + `SimulatedProvisioning` impl + visible "invite pending" state.
- **UI:** a NEW **"Add Lead" form** (name/phone/source/source_detail/discipline/notes) on the admin board; wire the trial form (real inputs/state); the convert modal (plan picker); the coach trials surface; Arabic-RTL + i18n keys (`notifications.lead_new/trial_scheduled/lead_converted.*`).
- **Behavior-green e2e:** new spec asserting the full chain on the cloud DB in CI — **origination both ways** (public web submit **and** staff "Add Lead" each → gym-scoped lead with correct `source` + `lead_new`); schedule trial → row + coach notified + coach sees it; convert → profile+student+membership+invoice(TVA-correct)+`converted_student_id`+`lead_converted`+simulated-invite; member visible on admin roster + billing. Fail loudly if any portal doesn't reflect a step.
- **Strategic-context block** (benchmark gaps from §0 + Phase-1 placement + deferrals from §9) carried in the prompt.
- **F2 hygiene:** scoped `git add` (never `-A` in a worktree), `node_modules` gitignored, manual worktree (Agent-tool isolation is broken here).
- **Drag log:** the coder appends to `audit-cycle-update.md` and ends with an honest **"clean (like 22-R/F2) vs slog (legacy cruft)"** read — the measurement that decides strangle-vs-rewrite.

---

*Awaiting sign-off on this design. On approval I issue ONE sequential coder prompt for the rebuild slice — not a parallel mission.*
