# CODER PROMPT AX-2 — Landing polish: hero balance + discipline cards/icons + working map

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** post-deploy polish on the LIVE landing (operator demo feedback, 2026-06-15). Branch `prompt-ax2-landing-polish` off `main`. **Zero schema.** Three diagnosed defects on the public landing — the demo's first impression.

## Defect 1 — Hero reads offset/lopsided
**Root cause:** `HeroSection.tsx` is a centered full-bleed layout, but `public/landing/hero.jpg` is a **banner with "START YOUR OWN SAGA / TRAIN LIKE THE MAIN CHARACTER / by Fakih Brothers" text baked into the image.** Under `object-cover` it crops left-of-center, the dark gradients bury it, and the baked-in text fights the live overlaid headline → the section looks unbalanced (content crammed right, dark dead space left).
**Fix:** use a **clean full-bleed gym action photo with NO baked-in text** as the hero background (pick one of the existing real photos in `public/landing/` that has no text overlay, e.g. a training/gym-interior shot; if none is clean, use `gym-1..6`-class images). Keep the centered content (logo, headline, CTAs). The only text on the hero must be the live DOM text. Verify the headline/CTAs sit centered and balanced at desktop AND mobile widths (no right-shift, no dead left panel).

## Defect 2 — Program/discipline cards bland + wrong icons + wrong count + orphan stacking
**Root causes (`DisciplinesSection.tsx`):** icons are assigned by **position** (`ICONS[idx % len]` = Dumbbell/Shield/Heart/Music/…) → MMA renders a 🎵 music note; the subtitle is hardcoded i18n "World-class training across **6** disciplines" while only 4 active disciplines exist; 4 cards orphan in a 3-col grid.
**Fix:**
- **Discipline-appropriate icons** via a **name-keyword → icon map** (tenant-clean: keyed on the discipline's English name, with a sensible default for unknown gyms). Distinct, internationally-recognizable combat-sport icons — recommended source **game-icons.net** (CC-BY, ship the SVGs locally in `public/landing/disciplines/` or as inline React components):
  - Muay Thai → a muay-thai/elbow-knee strike icon (e.g. game-icons "muay-thai"/"high-kick")
  - Boxing → boxing glove (game-icons "boxing-glove")
  - Kick Boxing → high kick (game-icons "high-kick")
  - MMA → octagon/cage or grapple (game-icons "mixed-martial-arts" / "octagon")
  - Default (unknown discipline) → a generic combat/dumbbell icon.
  (Acceptable simpler fallback if SVG sourcing is slow: 🥊/🥋 emoji per the same keyword map — but distinct SVGs look far better; prefer them.)
- **Dynamic count:** replace the hardcoded "6" — the subtitle counts the actual active disciplines (e.g. `t('subtitle', {count})` → "World-class training across {count} disciplines …"). Add the ICU/interpolation key in ar/en/fr.
- **Richer, balanced cards:** make the cards visually stronger (larger icon, discipline name, a short tagline or class-count if cheap, clear hover) and ensure **any count stacks cleanly** — use a grid that centers/justifies the last row (e.g. `flex flex-wrap justify-center` with fixed-width cards, or `grid` with `justify-items-center` + a max that avoids a lonely orphan). 4 cards must not leave one stranded.
- Keep it **tenant-clean**: the keyword map has a default; nothing Proline-specific hardcoded beyond the shared combat-sport mapping.

## Defect 3 — Facility map is blank
**Root cause (`FacilitySection.tsx`):** the keyless Google Maps embed renders an empty dark box (recurring).
**Fix:** replace with a **reliable keyless OpenStreetMap embed** — an `<iframe>` to `https://www.openstreetmap.org/export/embed.html?bbox=<…>&marker=<lat,lng>` centered on **Sky Business Center, Baabda, Lebanon** (geocode the coordinates; Baabda ≈ 33.834, 35.544 — verify/refine to the actual building), plus a "View on Google Maps" link (`https://www.google.com/maps/search/?api=1&query=Sky+Business+Center+Baabda`) under it. OSM needs no API key and always renders. Keep the address text + the existing card chrome. (If the operator later supplies a Google Maps API key, that's a trivial swap — but ship OSM now so it's never blank.)

## Out of scope
Schema; other sections; the `sharp` install (separate one-liner); Google Maps API key procurement.

## Verify (e2e, ephemeral TI gym + visual)
1. **Disciplines:** the subtitle count equals the number of seeded active disciplines (assert the rendered number matches, not a hardcoded 6); each card renders a non-default icon for a known discipline name (assert the MMA/Boxing cards don't both fall to the default); cards present for all active disciplines, no console error.
2. **Map:** the Facility section contains an iframe whose `src` includes `openstreetmap.org/export/embed` (or a real Google embed with a key) — NOT the null-place placeholder; the "View on Google Maps" link is present.
3. **Hero:** no baked-text image regression — assert the hero `<img>`/background is the clean photo (filename check) and the headline is centered (smoke).
4. `/ar` renders all three clean (RTL, no MISSING_MESSAGE); full suite green — no regression (75+ tests).

## Acceptance
1. Hero balanced (clean photo, centered) at desktop + mobile; cards have correct per-discipline icons + dynamic count + clean stacking; map renders (OSM keyless) — all green in E2E CI (run ID/URL) + operator-visible on the live deploy after redeploy.
2. Zero schema; tenant-clean (keyword icon map + default); i18n ar/en/fr; `tsc`+`build` clean.

## Hygiene
Branch `prompt-ax2-landing-polish` off `main`; **dev port 3000**; scoped `git add` + `git show --stat` (commit any new SVG/photo assets); **no Claude/Co-Authored-By trailer**; TI ephemeral gym; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / AX-2 — Landing polish`: the hero-image swap, the discipline icon-map + dynamic count, the OSM map fix, CI run ID/URL, an explicit **"Hero balanced + per-discipline icons + dynamic count + map renders: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. (After merge: operator redeploys on Railway to see it live.)

---

### Copy-paste activation block for the MAINLINE coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ax2-landing-polish off main (git checkout main && git pull && git checkout -b prompt-ax2-landing-polish).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-AX2-landing-polish.md

Post-deploy landing polish from live operator feedback. ZERO schema. Three diagnosed defects:
(1) HERO offset: HeroSection is centered but public/landing/hero.jpg has the "START YOUR OWN SAGA…" text
BAKED INTO the image → object-cover crops it left + competes with the live headline. Fix: use a CLEAN
full-bleed gym action photo with NO baked text (pick a clean existing public/landing/ photo), keep
content centered, balanced at desktop + mobile.
(2) DISCIPLINE CARDS (DisciplinesSection.tsx): icons are positional (ICONS[idx%len] → MMA got a music
note); subtitle hardcodes "6 disciplines" but only 4 exist; 4 cards orphan in a 3-col grid. Fix:
name-keyword→icon map (tenant-clean w/ default) with distinct combat-sport icons — game-icons.net (CC-BY,
ship SVGs locally): Muay Thai→muay-thai/high-kick, Boxing→boxing-glove, Kick Boxing→high-kick,
MMA→mixed-martial-arts/octagon, default→generic (emoji 🥊/🥋 acceptable fallback but prefer SVGs);
DYNAMIC count via t('subtitle',{count}) = active disciplines (add the key ar/en/fr); richer cards that
stack cleanly for ANY count (flex-wrap justify-center or grid justify-items-center — no lonely orphan).
(3) MAP (FacilitySection.tsx): keyless Google embed renders blank → replace with a keyless OpenStreetMap
iframe (openstreetmap.org/export/embed.html?bbox=…&marker=lat,lng centered on Sky Business Center Baabda
~33.834,35.544 — refine to the building) + a "View on Google Maps" link; keep address + card chrome.
i18n ar/en/fr, RTL, tenant-clean.
Verify in the E2E CI run, not tsc: disciplines subtitle count == seeded active disciplines (not 6) +
known-discipline cards render non-default icons; Facility iframe src includes openstreetmap.org/export/
embed (not the null placeholder) + "View on Google Maps" link present; hero background is the clean photo
(filename) + headline centered; /ar clean (no MISSING_MESSAGE); FULL suite green (75+, no regression). If
the sandbox can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port
3000; scoped git add + git show --stat (commit new assets); no Claude/Co-Authored-By trailer; never weaken
RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / AX-2 — Landing polish": the hero-image
swap, discipline icon-map + dynamic count, OSM map fix, CI run ID/URL, an explicit "Hero balanced +
per-discipline icons + dynamic count + map renders: PASS/FAIL" line, and a DRAG READ. Then STOP and tell
me AX-2 is ready for review.
```
