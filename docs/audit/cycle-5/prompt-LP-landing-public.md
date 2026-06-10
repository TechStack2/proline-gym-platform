# CODER PROMPT LP — Landing: Public Brand + Live Schedule/Offerings (clean rebuild on main)

> **For:** the MAIN coding agent (single track now) · **Issued by:** Project Auditor · **Sequence:** demo-prep slice; branch `prompt-lp-landing` off **current `main`** (which already has B2). The earlier parallel `prompt-landing-boost` worktree is being **discarded** — reuse its good NEW components as a starting point, but rebuild cleanly on `main` (no divergent merge).
> Self-contained.

## Why
The client posts their **schedule + offerings** as social-media images and wants them **on the landing**, admin-managed. Today the landing's data sections only render to **logged-in** users (RLS `_read` requires `authenticated`) and there's no schedule embed — the benchmark "live schedule embed" gap (Portal A) + the public-read gap. With the demo moved, do it **properly**: brand + live schedule/offerings + a working map + **anon/public read** so logged-out visitors see it. See [[proline-brand-assets]], [[proline-real-offerings]], [[proline-monetization-model]].

## Role/Skill/Lens
`architect` (page structure) + **`database-reviewer`** (anon-read RLS must expose ONLY public catalog data, never PII) + `e2e-runner`. Superpower: `verification-before-completion` — prove a **logged-out** visitor sees the schedule + pricing.

## Reuse vs rebuild (avoid the divergent-merge mess)
The discarded branch `origin/prompt-landing-boost` has GOOD new components — pull them onto your fresh branch (new files, no conflict):
```
git checkout origin/prompt-landing-boost -- \
  src/components/marketing/AffiliationsSection.tsx \
  src/components/marketing/ChampionsSection.tsx \
  src/components/marketing/GallerySection.tsx \
  src/components/marketing/ScheduleSection.tsx \
  src/components/marketing/LandingImage.tsx \
  src/lib/marketing/gym.ts
```
Then **rebuild on top of main** (don't merge the branch): re-apply the `(marketing)/page.tsx` wiring, the `HeroSection` rework, the `PricingSection`/`DisciplinesSection` gym-filter, and the landing i18n keys — fixing the issues below.

## Build
1. **Anon/public read (migration — next number after B2, e.g. `000035`):** add `anon`-role `SELECT` policies for **`disciplines`, `classes`, `class_schedules`, `membership_plans`** — restricted to **active rows of active gyms only** (`is_active`/status), exposing only public catalog fields. **Do NOT expose** students, attendance, registrations, profiles, payments, or any PII. `database-reviewer`: confirm no leak. (This is what makes the landing render to logged-out visitors.)
2. **Page structure** (validated): Hero → Affiliations → Disciplines → Schedule → Champions → Gallery → Why → Pricing → Facility(map) → Trial CTA. All gym-scoped to the active gym + `is_active`.
3. **WORKING MAP:** replace the placeholder embed (`!1s0x0%3A0x0!` renders blank) with a **real Google Maps embed** for **Sky Business Center, Baabda** (the operator will provide the real `<iframe src>` from Google Maps → Share → Embed; until then use a valid place-search embed, not the null-place placeholder). Keep the address text.
4. **Schedule grid:** render `classes` + `class_schedules` as the weekly grid (rows = time slots, cols = days) matching the flyer (red/black) — the real Kids/Juniors/Ladies/Adults M/W/F structure once those classes exist (created in admin, which now works post-B2).
5. **Pricing/offerings:** show membership plans **and** class monthly fees (B2 added `classes.monthly_fee_usd/lbp`) — both products.
6. **Images:** 18 real photos are already in `public/landing/` (hero.jpg, gym-1..6, champions-1..4, + IG photos) — wire them (hero, gallery, champions). **Affiliation logos** (LMF/IFMA/Arab Muaythai) are NOT dropped yet — wire `/public/landing/affiliations/{lmf,ifma,arab-muaythai}.png` slots with **graceful fallback** (render a text affiliation strip if a logo file is missing). **Commit the `public/landing/*.jpg` files.**
7. **Real brand copy** (no placeholders): hero "START YOUR OWN SAGA. TRAIN LIKE THE MAIN CHARACTER. — by Fakih Brothers"; real programs/voice. i18n ar/en/fr; Arabic-RTL; no `MISSING_MESSAGE`.

## Verify (the public-read proof)
e2e in the ephemeral run gym (TI helpers): a **LOGGED-OUT** visit to `/` renders the **Schedule + Pricing + Disciplines** (not empty) and the branded sections; `npm run build` clean. (Pre-fix: logged-out = empty; post-fix: populated.) No `MISSING_MESSAGE`.

## Acceptance
1. Logged-out landing renders live schedule + pricing + brand — green in E2E CI (run ID/URL).
2. Anon-read RLS exposes **only** public catalog (no PII) — `database-reviewer` confirmed.
3. Working map; real images + copy; affiliation slots with fallback.
4. `tsc`+`build` clean; gym-scoped + `is_active`; no other RLS weakened.

## Hygiene
Branch `prompt-lp-landing` off `main`; **dev port 3000**; scope `git add` (commit the landing images + code; never `-A`); **no Claude/Co-Authored-By trailer**; use TI ephemeral-gym for e2e.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / LP — Landing Public Brand + Schedule/Offerings`: the anon-read migration + the database-reviewer no-PII confirmation, the components reused vs rebuilt, the map fix, the CI run ID/URL, an explicit **"Logged-out landing renders live schedule/offerings: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
Landing only (+ the anon-read migration). Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Then the auditor resumes the V1 track at **B3 (family/household)**.

---

### Copy-paste pointer for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-lp-landing off main (git checkout main && git pull && git checkout -b prompt-lp-landing).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-LP-landing-public.md

Rebuild the public landing CLEANLY on main (the parallel prompt-landing-boost branch is discarded —
reuse its good NEW components but do NOT merge it). First pull the good files:
  git checkout origin/prompt-landing-boost -- src/components/marketing/{AffiliationsSection,ChampionsSection,GallerySection,ScheduleSection,LandingImage}.tsx src/lib/marketing/gym.ts
then rebuild on main: (marketing)/page.tsx wiring, HeroSection rework, Pricing/Disciplines gym-filter,
landing i18n keys.
Do: (1) MIGRATION (next number after B2, ~000035): anon-role SELECT policies on disciplines/classes/
class_schedules/membership_plans for ACTIVE rows of active gyms ONLY — public catalog only, NO PII
(no students/attendance/registrations/profiles/payments); database-reviewer confirms no leak. This makes
the landing render to LOGGED-OUT visitors. (2) Page order Hero→Affiliations→Disciplines→Schedule→
Champions→Gallery→Why→Pricing→Facility(map)→Trial CTA, gym-scoped + is_active. (3) FIX THE MAP: replace
the null-place placeholder embed with a real Google Maps embed for Sky Business Center, Baabda (operator
will supply the iframe; use a valid place-search embed meanwhile). (4) Schedule = weekly grid from
classes+class_schedules (red/black flyer style). (5) Pricing shows membership plans AND class monthly
fees (classes.monthly_fee_usd from B2). (6) Wire the 18 real photos already in public/landing/ and COMMIT
them; affiliation logos /public/landing/affiliations/{lmf,ifma,arab-muaythai}.png with graceful fallback
to a text strip if missing. (7) Real brand copy (saga tagline / Fakih Brothers); i18n ar/en/fr; Arabic-
RTL; no MISSING_MESSAGE.
Verify in the E2E CI run, not tsc: a LOGGED-OUT visit to / renders Schedule+Pricing+Disciplines (not
empty) + branded sections; build clean. If the sandbox can't run the browser, push so e2e.yml runs and
report the run ID; do NOT fabricate. Dev port 3000; scope every git add (never -A); no Claude/
Co-Authored-By trailer; don't weaken any other RLS.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / LP — Landing Public Brand + Schedule/
Offerings" with the anon-read migration + no-PII confirmation, components reused vs rebuilt, the map fix,
CI run ID/URL, an explicit "Logged-out landing renders live schedule/offerings: PASS/FAIL" line, and a
DRAG READ. Then STOP and tell me LP is ready for review.
```
