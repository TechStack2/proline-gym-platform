# CODER PROMPT COACH-LP — grandiose coach showcase on the landing + coach-edit → admin-publish workflow

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-coach-lp` off `main`. Demo feedback: showcase the gym's coaches **grandiosely** on the public landing (current **and** "coming soon" coaches); a **coach edits their own profile** from the coach portal; **staff edit + the FINAL push-to-live is admin-gated** (coach edits are pending until an admin publishes). Staff publish/edit lives in the **Coach-360 hub** (TEAM-1's `coaches/[id]`).

## Leverage (verify real columns first)
- Coaches already have `specialization_ar/en/fr`, `bio_ar/en/fr`, and **avatars** (ADM-2). The data largely exists.
- **The publish-to-landing pattern exists** — `000036_landing_publish_switch.sql` (`show_on_landing` for classes). Mirror it for coaches.
- **Showcase template:** `src/components/marketing/ChampionsSection.tsx` (model the new section on it, elevated).
- **Coach-360 hub** = `src/app/[locale]/(dashboard)/coaches/[id]/page.tsx` (TEAM-1) — staff edit + publish goes here.
- Coach portal profile = `src/app/[locale]/coach/profile/page.tsx` (currently **read-only** — add the editor).

## The workflow (the core of this slice)
**Coach edits in the portal → saved as PENDING (not live) → staff reviews in Coach-360 → admin "Publish to live" applies pending→live + shows on landing.** Staff can also edit directly and publish. The admin publish is the only path to the public landing.

## Build
### 1. Schema (minimal + named — propose the leanest that satisfies the workflow)
Add to `coaches` (or a small companion table) — verify real columns, keep minimal:
- a **landing-publish flag** (`landing_visible` bool, admin-set) + a **status** for current vs future (`landing_status`: `active` | `coming_soon`).
- a **pending-edit (draft) mechanism** so coach edits don't go live until published — e.g. draft columns (`bio_draft_*`, `specialization_draft_*`, `photo_draft`) **or** a `profile_pending` jsonb + `has_pending_changes` bool + `last_published_at`. Publishing applies pending→live. Pick the leaner; name it in the report.
- RLS: anon may read ONLY `landing_visible` coaches' **published** fields (never drafts/pending); coach may write own pending; staff (owner/head_coach/reception per TEAM-1) may edit + publish — **deactivate/publish gated to owner/head_coach** (mirror TEAM-1's guardrail). Never weaken existing RLS.

### 2. Landing coach showcase — the "grandiose" section (NEW)
A new `CoachesSection` (model on `ChampionsSection`, elevated) on the landing: published coaches as a premium display — avatar, name, specialty chips, bio. A tasteful **"coming soon" treatment** for `landing_status=coming_soon` coaches. Read-time, anon, published-only. i18n ar/en/fr + full RTL; design-system; on-brand crimson. (Optional, if clean: a dedicated `/[locale]/coaches` page for the full roster — but the landing section is the deliverable.)

### 3. Coach portal self-edit
Extend the read-only `coach/profile` page → an **editor** (bio, specialties, photo via the ADM-2 avatar upload). Saving writes the **pending draft**, with a clear "pending admin approval" state + a preview of how it'll look. Coach edits never hit the landing directly.

### 4. Staff edit + admin publish — in the Coach-360 hub
In `coaches/[id]` (Coach-360): staff see the coach's **pending draft** (diff vs live) + a **"Publish to live"** action (applies pending→live + `landing_visible`), a **"Coming soon" toggle**, and can **edit directly** then publish. Publish/landing-visibility gated to **owner/head_coach** (reception can edit, not publish — mirror TEAM-1). This is the admin's final gate.

## Out of scope
The broader portal-360 feature builds; offline; non-coach landing sections; new business logic beyond the publish workflow.

## Verify (e2e, ephemeral TI gym)
1. **Workflow end-to-end:** coach (coach@) edits their profile in the portal → it's **pending** (NOT on the anon landing yet); staff (owner) opens Coach-360 → sees the pending change → **Publish** → the coach now appears/updates on the **anon** landing showcase.
2. **Coming soon:** a `coming_soon` coach renders in the future treatment on the landing.
3. **Leak guard (RLS):** an unpublished/pending edit + a non-`landing_visible` coach do **NOT** appear on the anon landing; anon cannot read drafts.
4. **Permissions:** reception can edit but **not** publish; owner can publish. `/ar` landing showcase RTL-clean; full suite green (no regression).

## Acceptance
1. Grandiose landing coach showcase (current + coming-soon) + the coach-edit→admin-publish workflow proven end-to-end (pending → publish → anon landing reflects); admin-gated publish; RLS proven (anon = published only). Green in E2E CI (run ID/URL).
2. Schema minimal + named; `database-reviewer`: no RLS weakened, publish gated on caller role; i18n ar/en/fr; RTL; design-system.

## Hygiene
Branch `prompt-coach-lp` off `main`; **dev port 3000** (mainline lane); migration via **Verify-Foundation** (`-f apply=true -f migrations='…'`, confirm success) BEFORE e2e; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "COACH-LP ready" + CI run ID.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / COACH-LP — coach landing showcase + edit→publish workflow`: the schema (minimal + named), the showcase, the workflow + permission gating, the RLS leak-guard, CI run ID/URL, an explicit **"showcase + coach-edit→admin-publish→anon-landing + RLS leak-guard: PASS/FAIL"** line, and a DRAG READ.
