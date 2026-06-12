# CODER PROMPT LPX-1 — Landing SEO & polish (PARALLEL TRACK)

> **For:** the PARALLEL coding agent (Opus, worktree `../proline-rep1`) · **Issued by:** Project Auditor · **Sequence:** after ON-1-S. Branch `prompt-lpx1-seo` off current `main` (`git fetch origin && git checkout -b prompt-lpx1-seo origin/main`).
> **PARALLEL-TRACK RULES:** zero schema/migration/RLS. **COLLISION FENCE (PT-1 is in flight on the mainline and ADDS a PT section to the landing):** do NOT touch `(marketing)/page.tsx`, do NOT create/modify any PT-related marketing component, do NOT touch `src/lib/marketing/` data fetchers. Your surface: `(marketing)/layout.tsx` + new metadata/SEO files (sitemap/robots/OG), `LandingNav`/`LandingFooter`, individual NON-PT section components (Hero/Champions/Why/Facility/Gallery/Affiliations), `public/` assets, and landing i18n keys (additive — expect trivial JSON merges). If a change seems to need `page.tsx`, STOP and report.

## Strategic context
The landing is the white-label storefront and the lead-gen front door (social ads → landing → trial CTA → 23R pipeline). It renders live data now (LP/ADM-1) but ships with default metadata, no social-share cards, no structured data, and no sitemap — invisible to search and ugly when shared on WhatsApp/Instagram, which is EXACTLY how Lebanese gyms acquire (their ads and shares). **Tenant-clean:** all copy/identity via i18n + gym data — no new hardcoded Proline strings beyond what the i18n files already carry.

## Build
1. **Metadata (per-locale):** `generateMetadata` in `(marketing)/layout.tsx` — localized title/description (ar/en/fr), canonical + hreflang alternates, theme color.
2. **Social cards:** OpenGraph + Twitter meta with a real OG image — compose a 1200×630 `public/landing/og.jpg` from the existing hero photo (static file, committed). WhatsApp link-preview verified (OG basics suffice).
3. **Structured data:** JSON-LD `LocalBusiness`/`SportsActivityLocation` (name, address [Sky Business Center, Baabda], geo if cheap, opening hours from the schedule heuristics OPTIONAL — skip if not clean), rendered in the layout.
4. **`sitemap.ts` + `robots.ts`** (Next conventions): locale landing routes only (no app routes; explicitly disallow `/api`, dashboard/portal/coach paths in robots).
5. **Performance pass on the landing only:** correct `next/image` `sizes`/`priority` (hero priority, gallery lazy), font loading sanity, no layout shift on the hero. Target: Lighthouse perf ≥ 85 / SEO ≥ 95 mobile (report the numbers you measure locally; CI doesn't gate Lighthouse).
6. **Section copy polish (non-PT sections):** Champions + Why sections get the real voice from the existing brand i18n (tighten placeholders if any remain); Facility section: keep the keyless map embed, refine the query string to the precise pin ONLY if the operator's pin verdict (pending) says it's off — otherwise leave it.
7. **Smoke e2e addition (1 test):** logged-out `/en` has the OG/meta tags + JSON-LD script present, sitemap.xml and robots.txt respond 200 with expected entries. No visual assertions.

## Verify
e2e: existing landing spec still green + the new smoke test; `tsc`+`build` clean; report measured Lighthouse mobile numbers (informational). Full suite green via `gh workflow run "E2E Verification (behavior-green gate)" --ref prompt-lpx1-seo` — report the run ID; queue-aware (the mainline PT-1 gate may be running — wait it out).

## Acceptance
1. Per-locale metadata + OG image + JSON-LD + sitemap/robots live and smoke-tested in CI (run ID/URL).
2. Collision fence respected: zero diffs in `(marketing)/page.tsx`, PT components, `src/lib/marketing/` (the diff is the proof).
3. Lighthouse numbers reported; no regression (50+ tests by the time PT-1 lands — rebase story: if main moves, finish on your base and report; the auditor handles merge order).

## Hygiene
Worktree only; port 3100; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / LPX-1 — Landing SEO & polish (parallel)`: what shipped, the Lighthouse numbers, CI run ID/URL, an explicit **"Meta/OG/JSON-LD/sitemap live + fence respected: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only; report PASS/FAIL to the operator. Next parallel slice: fr i18n completeness sweep (prompt later).

---

### Copy-paste activation block for the PARALLEL coder (Opus session)
```text
You are the PARALLEL coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-rep1 (worktree).
Setup: git fetch origin && git checkout -b prompt-lpx1-seo origin/main

Read in full and execute exactly:
  docs/audit/cycle-5/prompt-LPX1-landing-seo-polish.md

PARALLEL RULES: zero schema/migration/RLS. COLLISION FENCE — the mainline PT-1 slice is adding a PT
section to the landing right now: do NOT touch (marketing)/page.tsx, any PT marketing component, or
src/lib/marketing/. Your surface: (marketing)/layout.tsx + new SEO files, LandingNav/LandingFooter,
non-PT sections (Hero/Champions/Why/Facility/Gallery/Affiliations), public/ assets, additive landing
i18n keys. If something needs page.tsx — STOP and report.
Do: (1) generateMetadata in (marketing)/layout.tsx: localized title/description ar/en/fr, canonical +
hreflang, theme color. (2) OpenGraph+Twitter cards with a real committed public/landing/og.jpg
(1200×630 from the hero photo) — WhatsApp share preview is the use case. (3) JSON-LD LocalBusiness/
SportsActivityLocation (name, Sky Business Center Baabda address; skip anything not clean). (4)
sitemap.ts + robots.ts (locale landing routes only; disallow /api + dashboard/portal/coach). (5) Landing
perf pass: next/image sizes/priority (hero priority, gallery lazy), no hero layout shift; measure +
report Lighthouse mobile perf/SEO (target ≥85/≥95, informational). (6) Non-PT copy polish via i18n only;
leave the map embed unless the operator says the pin is off. (7) ONE smoke e2e: logged-out /en has
meta/OG/JSON-LD; sitemap.xml + robots.txt 200 with expected entries.
Verify in CI: gh workflow run "E2E Verification (behavior-green gate)" --ref prompt-lpx1-seo (queue-
aware — the mainline PT-1 gate may be running; wait it out) — report the run ID; existing landing spec +
full suite green; do NOT fabricate. If main moves under you, finish on your base and report — the
auditor owns merge order. Scoped git add + git show --stat; no Claude/Co-Authored-By trailer.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / LPX-1 — Landing SEO & polish
(parallel)": what shipped, Lighthouse numbers, CI run ID/URL, an explicit "Meta/OG/JSON-LD/sitemap live
+ fence respected: PASS/FAIL" line, and a DRAG READ. Then STOP and report to the operator.
```
