# V1 Readiness Review — PRO LINE Gym Platform (Cycle 5)

> **Auditor deliverable, 2026-06-15.** The V1 build phase is complete: **32 slices merged green, zero regressions in main's history.** This review is the deploy gate — re-score, live security/data audit, known residue, deploy checklist, demo script. **Verdict up front: GO for production deploy**, conditional only on the operator deploy-checklist (§5) — no code blockers.

## 1. Verdict
**GO.** Every locked V1 scope item shipped and is behavior-green in the standing e2e gate. The live readiness audit (§3, VF run 27525993762) found **no RLS gaps, no migration drift, multi-tenant isolation intact.** Remaining items are operator deploy steps (§5) and an honest V1.1 backlog (§4) — none block launch.

## 2. Maturity re-score (benchmark 0–5; cycle start → now)
Cycle 5 opened with a prototype scored ~L1 (parity-only, cosmetic handoffs, schema-shaped admin). Where V1 lands:

| Surface / journey | Start | **V1** | Evidence |
|---|---|---|---|
| **Admin IA** (journey-centric) | 1.0 | **3.5** | 17 tabs → 7 workspaces; Today cockpit + Inbox + Member-360 + Money (IA-1/2/3, FD-1) |
| **Lead → member** (acquisition) | 1.1 | **3.5** | 23R pipeline + GRW-1 anon capture, sources, funnel, tracked links/QR |
| **Recurring classes** (B2) | 1.2 | **3.0** | request→approve(+discount)→bill→roster + waitlist auto-promote |
| **PT 360** | 1.0 | **3.5** | catalog + desk sale + package-first + refill/expiry (PT-1) + Calendly-style availability booking (PT-2) |
| **Billing / money** | 2.3 | **3.5** | D1 canonical issue/record + FIN-1 owner dashboard (revenue/aging/methods) |
| **Membership lifecycle** | 1.0 | **3.5** | ML-1 auto-renew + dunning/lapse + bounded freeze + plan change (daily tick) |
| **Churn / win-back** | 0 | **3.0** | FIN-1 win-back queue (read-time reactivation loop) |
| **Family / guardians** | 0 | **3.0** | B3 payer-on-invoice + guardian portal + household billing |
| **Camps** | 0 | **3.0** | E1 create→publish→register(guardian payer)→deposit→run |
| **Member/coach onboarding** | 0 | **3.0** | ON-1 staff invite + external share + forced-change + onboarding |
| **WhatsApp** | 0 | **2.5** | G1 wa.me bridge (day-1) + Cloud-API toggle (activate post-approval) |
| **Attendance + offline** | 1.2 | **3.0** | 24R/REP-1 marking + reporting; G2 offline queue + reconnect-sync |
| **Arabic-first + design** | 1.5 | **3.5** | AX-1 full ar fidelity (root-cause middleware fix) + brand font + design system + shell identity |
| **Waivers** | 0 | **3.0** | F3 configurable consent + signature + guardian-for-minor |

Net: a prototype became a **journey-coherent, multi-tenant, Arabic-first operating system for the gym** — the cohesion gap (work arrives invisibly, person-state shredded across tabs) is closed.

## 3. Live security & data audit (read-only, VF run 27525993762)
- **Migration chain:** 57 numbered (000001–000057) + 3 one-off demo-hygiene seeds; latest 000057; **no unexpected hotfix drift** (the earlier E1 live-DB drift is reconciled into the numbered chain). ✓
- **RLS coverage:** tables with `gym_id` but RLS disabled → **none**; RLS-enabled tables with zero policies → **none**; **110 policies across 46 RLS tables.** Multi-tenant isolation (the white-label safety) is intact. ✓
- **Demo gym:** 4 disciplines (Muay Thai/Kick Boxing/Boxing/MMA — operator-entered), 4 active coaches, 3 active classes, 12 members, 219 notifications. Demo-ready (optional: prune notifications further for a pristine demo).

## 4. Known residue → V1.1 backlog (honest, non-blocking)
Carried from slice drag-reads:
- **WhatsApp:** dunning + trial-inquiry acks still fire from SQL producers (in-app notification works; route through the dispatch seam when surfaced app-side); live provider sends free-text (24h-window — templates for outside it, D5 scaffolding unwired); gym-branded sender = G1-full.
- **Offline (G2):** per-(class,date) group flush vs per-item; roster-cache-vs-queue coherence on long offline windows; dormant generic `SyncEngine` left in place (unused); SW cold-open caveat.
- **Waivers (F3):** one waiver/gym; no hard "must-sign-before-train" enforcement gate (by design); monotonic version assumption.
- **Reporting (REP-1):** attendance reports are the honest small set (no revenue/belt analytics — deferred).
- **Cut to V2 (scope-lock):** rentals (E2), PWA push notifications, weekly-pass for classes, POS, multi-location, marketing automation, in-app two-way chat.
- **Phone-OTP login** (ON-1 finding): members currently log in with the synthetic-email + temp password staff share; switching login to real phone-OTP needs the Supabase **phone provider enabled** + an OTP/SMS provider — a clean credential swap when desired.

## 5. Deploy checklist (Railway) — the only GO conditions
1. **Service env vars** (Railway → Variables, server-only, NOT `NEXT_PUBLIC_` for secrets):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, client)
   - `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_…` key — ON-1 invites) ✓ set
   - `WHATSAPP_TOKEN_ENC_KEY` (G1 token encryption — **set once; rotating orphans stored ciphertext**)
   - `NEXT_PUBLIC_SITE_URL` (the Railway/real domain — LPX-1 canonical/OG/sitemap)
2. **Build/start:** `npm run build` / `npm run start` (Railway injects `PORT`; Next honors it). Confirm the GitHub→Railway connection points at `TechStack2/proline-gym-platform` `main`.
3. **Post-deploy smoke** (prod URL): logged-out landing renders (ar/en/fr); owner login → Today; create a class → appears on landing after publish; record a payment; send a wa.me reminder.
4. **Post-launch security:** rotate/revoke the demo `SUPABASE_ACCESS_TOKEN` if CI no longer needs ephemeral-gym provisioning (or keep scoped for ongoing CI); the `sb_secret_` key is individually revocable from the Supabase dashboard if ever needed.
5. **Demo data:** optional notification prune for a pristine first impression; confirm the 4 classes carry the real M/W/F flyer times + $60 fee + landing publish flags.

## 6. Sales demo script (the buying-criteria arc)
A 10-minute path that hits every owner ask, in order:
1. **Landing** (logged-out, `/ar`) — brand, live schedule, affiliations, "Book a free trial" → submit a lead.
2. **Front desk / Today** — the lead lands in Prospects (with source); show the day's classes + one-tap attendance; the money tally.
3. **Member-360** — open a member: membership status, PT package (remaining/validity + invoice), registrations, belt, waiver — "every question answered on one screen."
4. **PT booking** — show a coach's availability + instant-book (the Calendly moment); the refill nudge.
5. **Money + win-back** — revenue by product, aging, and the win-back queue ("the system chases dropped members for you").
6. **WhatsApp** — tap a renewal reminder → their own WhatsApp opens prefilled (works today, no approval); explain the auto-send toggle for later.
7. **Invite** — invite a member to the portal, share via WhatsApp; show the onboarding.
8. **Arabic + multi-gym** — flip to Arabic (full RTL, brand font); note the per-gym data model = white-label ready.

## 7. Recommendation
Deploy to Railway once §5 vars are confirmed. Onboard Proline as design partner / tenant #1. The white-label phase (landing CMS, gym-onboarding wizard productizing the TI seed, subdomain routing, per-gym WhatsApp, SaaS billing) is architecturally pre-paid by the tenant-clean rule enforced since the IA pivot — it's the natural Cycle 6.
