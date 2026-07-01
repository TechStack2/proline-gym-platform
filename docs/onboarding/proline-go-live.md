# Proline Gym — Production Go-Live Runbook (first paying tenant)

**Status:** onboarding phase, started 2026-07-01 (Proline signed after a demo). This is the auditor-driven checklist to get Proline live on their **own** production tenant.

## Decisions locked (owner, 2026-07-01)
- **Clean production tenant**, separate from the `proline-gym` DEMO — the demo stays pristine as a **sales showcase** for future prospects.
- **Data: BOTH** — import their existing Excel (bulk current members) **and** fresh in-app entry going forward.
- **Products: classes + PT only** (no membership) — set via the per-gym `enabled_products` flag (NO-MEMBERSHIP slice).

## Sequence (gated — do in order)

### P1 — RLS isolation (BLOCKER) · Lane A `prompt-rls-isolation`
Fix the two cross-tenant leaks (`audit_logs` no gym_id; `pt_sessions` `is_staff()`-only RLS) + a two-gym isolation e2e. Auditor reviews the RLS diff + VF-applies (`000069`/`000070`). **MUST land before a second real tenant exists on the project.**

### P2 — Provision Proline's clean tenant (auditor, after P1)
1. `INSERT gyms` row — slug e.g. `proline` (prod), name Proline, `Asia/Beirut`, currency USD, `enabled_products = {membership:false, class:true, pt:true}`.
2. Minimal seed — their disciplines, `belt_hierarchies` per discipline, their coach(es).
3. Admin — create profile + `user_roles(owner)` bound to the new gym_id; activate via `inviteToPortal()`; send login.
4. **Isolation check** — admin logs in, sees ONLY the new gym (zero demo data). This is the P1 payoff, verified live.

### P3 — Config + data + hide demo
- `enabled_products` already set at P2 → only classes + PT surfaces render.
- **Import** their Excel (one-time auditor script: parse → students w/ phone + discipline + belt [+ class registrations / PT if present]); **fresh entry** via the app for the rest + ongoing.
- Hide the demo-account buttons on the production login (small slice or env flag).

### P4 — Defer (post-go-live polish / white-label)
Per-gym branding (color/logo/name), landing de-hardcode, gym-settings UI, and **productize a reusable Import-UI** (from the one-time import) for onboarding future gyms.

## Inputs needed from owner (async — gather while P1/NO-MEMBERSHIP land)
- [ ] Proline's **Excel export** of members (name, phone, discipline, belt; + class registration / PT if tracked).
- [ ] Their **admin identity** (owner name + phone/email) for the owner login.
- [ ] Their **disciplines** + **coach list** (for the minimal seed; may already be in the Excel).

## Go-live checklist
- [ ] P1 RLS-ISOLATION merged + VF (`000069`/`000070`)
- [ ] NO-MEMBERSHIP merged + VF (`000068`) 
- [ ] P2 gym row + admin + minimal seed created
- [ ] Isolation verified (admin sees only their gym; zero demo bleed)
- [ ] P3 Excel imported + demo-account buttons hidden
- [ ] Owner walkthrough on their live account → sign-off
