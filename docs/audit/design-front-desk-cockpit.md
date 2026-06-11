# Design study: Front-Desk Cockpit — Today 2.0 · Member-360 actionability · Members/Leads + portal invite

> **Auditor study, 2026-06-12** (operator's three points). Verdict up front: all three are aligned, staff-perspective-correct, and mostly recomposition of verified flows — they are the difference between "data is visible" (L2) and **"the system runs the morning shift" (L3)**. Plan in §5.

## 1. Today 2.0 — from status page to action queue

**Operating principle (anti-overkill):** Today is not a dashboard of charts; it is the answer to one question — *"what must this gym act on before closing tonight?"* Every card obeys three rules: **a number · a drill-down · a one-tap action.** Cards with nothing to say collapse to a single "✓ nothing today" line, so a quiet day is a short page.

**Card stack (priority order):**
| Card | Content | Drill / action | Data | Lands |
|---|---|---|---|---|
| **Now / Next** | current + next class, enrolled/capacity | → roster / mark attendance | exists | exists (keep) |
| **Inbox** | actionable count by type | → /inbox | exists | exists (badge → card) |
| **Expiring memberships** | ending today + next 7 days, per member | → Member-360 membership card (renew = D2/D3 action when it lands; until then "contact" + phone) | `student_memberships.end_date` (exists) | **FD-1** |
| **Money today** | due today / overdue count + USD total; collected today per method | → /money filtered; record payment | `invoices.due_date` + D1 tally (exist) | **FD-1** |
| **PT today** | sessions today; **"last-session" packages → refill nudge** (sell next pack) | → diary / Member-360 PT panel | needs package framing | **PT-1** (refill engine docks its card here) |
| **Dunning** | promised-to-pay / chase list | → Money | D3 | **D3** docks here |

**Key architectural move (FD-1):** Today becomes a **card framework** — each future slice (PT-1 refill, D2 renewals, D3 dunning) ships its card into the same stack instead of inventing a new surface. Today is the permanent docking station for "actionable intel."

## 2. Member-360 — every action carries the member

**Found defects (verified):** the quick-action pills are bare navigations — "New Registration" → `/classes` (the create-a-class page!), PT → the global `/pt` aggregate, payment → global `/payments/new`. The member context is dropped at the door.

**Design rule:** *on a member's file, every action is member-contextual* — open a modal/sheet pre-filled with this member, never navigate away to a global page:
- **Register to class** → class picker (active classes, capacity shown) → submits the existing B2 request/approve flow FOR this member (staff-initiated registrations skip straight to approve with optional discount).
- **Record payment** → D1 flow with member + their open invoices pre-selected.
- **PT panel** → becomes the member's PT cockpit per the approved PT-360 §3.1: package cards (remaining/validity/invoice state) + actions: **sell package** (PT-1 desk sale), **book session** (PT-2 slot picker), session history nested under each package. Until PT-1, the panel at minimum stops linking to the global aggregate.
- **Promote belt** (ADM-2 just built it here) · **link guardian** (B3 ✅) · **freeze/upgrade** (D2 docks here) · **send message** (G1 docks here) · **invite to portal** (§4).
The member file is the staff cockpit; slices keep docking actions into it — same pattern as Today.

## 3. Members list & Prospects — work the list, not just read it

**FD-1 upgrades (lean):**
- **Members:** search by **phone** (the Lebanese key) + name; status badges on rows (active / expiring ≤7d / frozen [D2] / owing); quick filters as chips: *owing money · expiring soon · no guardian (minors) · recently joined*; row quick-actions (call, open file, record payment). One list that answers "who needs attention" without opening files one by one.
- **Prospects (leads):** stage chips (new → contacted → trial scheduled → trial done → converted/lost, per 23R) with counts; **next-action date** surfaced + overdue-follow-up highlight (feeds a Today card later); row actions: log contact, schedule trial, convert (existing RPC). No kanban board in V1 — filters + dates deliver the value at a fraction of the surface.

## 4. Staff-triggered portal accounts (operator question: aligned or too much?)

**Aligned — with one design correction and one hard problem named.**
- **Correction:** the blueprint's end-state is passwordless phone-OTP (G1 wires WhatsApp). So the *durable* shape is "staff tap **Invite to portal** → member's phone becomes their login." The temp-password version is the right **bridge** while OTP infra doesn't exist yet: staff invite → system creates credentials (phone or email as username) + a one-time temp password shown ONCE to staff (shared via WhatsApp manually) → **forced password change on first login** → onboarding (language, notifications). When G1 lands, the same Invite button switches to sending an OTP/magic link — the staff workflow never changes.
- **The hard problem (why this is its own slice, ON-1):** gym-managed members are **login-less profiles** with random UUIDs (000018), while the whole RLS model assumes `profiles.id === auth.users.id`. Inviting an existing member means an **identity adoption** step: create the auth user, then re-key or adopt the existing profile (e.g., the F1 signup trigger learns to ADOPT a matching login-less profile by phone instead of inserting a new one — cascading the PK is the risk to engineer carefully). Also needs a server-side admin context (service-role server action) for user creation. Well-scoped, but auth-touching → **investigation-first slice, not a rider.**

## 5. Plan (recommended sequence)
1. **ADM-2** (running) — belts/avatars/sweep.
2. **FD-1 — Front-Desk Cockpit:** Today 2.0 framework + Expiring/Money cards; Member-360 contextual actions (fix the wrong-target pills); Members/Prospects list upgrade. Pure recomposition + reads; zero schema.
3. **PT-1 / PT-2** (approved design) — PT-1 docks the refill card into Today and the sell/book actions into Member-360.
4. **ON-1 — portal invite & onboarding** (identity-adoption investigation → temp-pass bridge → G1-ready).
5. **D2 → D3** (each docks its Today card + Member-360 action) **→ F3 → G1 → E1 → G2** → V1 readiness review → deploy.

The through-line: **Today and Member-360 are the two permanent docking stations** — every remaining slice lands as a card on one and an action on the other. That's what "journey-focused, not tab-focused" looks like at maximum potential.
