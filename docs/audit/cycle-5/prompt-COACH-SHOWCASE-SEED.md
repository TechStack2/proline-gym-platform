# CODER PROMPT COACH-SHOWCASE-SEED — publish a couple coaches in the demo reseed (so the showcase isn't empty)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-coach-showcase-seed` off `main`. **Tiny, demo-data only.** COACH-LP's landing showcase reads `landing_visible` coaches via `get_landing_coaches()`, but `reseed_proline_demo()` (mig `000058`) doesn't set any → the showcase renders **empty** in demos. Fold the publish into the reseed.

## Build
A small numbered migration that **redefines `reseed_proline_demo()`** (the existing live demo-reseed function — see [[demo-reseed-function]]) so that, after it seeds the 4 coaches, it also:
- sets **2–3 active coaches** `landing_visible = true`, `landing_status = 'active'`, with their `bio_*` + `specialization_*` populated (so the showcase cards have content — verify the columns COACH-LP/`000059` added);
- sets **1 coach** `landing_status = 'coming_soon'` (+ `landing_visible` per how COACH-LP's `get_landing_coaches` treats coming-soon — match its projection so the "future coach" teaser shows);
- leaves the rest unpublished.
Keep it **idempotent** (re-running yields the same published set) and **scoped to the proline-gym demo gym** (the function already resolves it). No new behavior — just demo data. Don't touch `get_landing_coaches`/the publish functions (COACH-LP owns those).

## Apply + verify
- Apply the migration via **Verify-Foundation** (defines the updated function), then invoke `SELECT reseed_proline_demo();` once (the deliberate reseed) — per the established pattern.
- Verify: after the reseed, `get_landing_coaches(<proline gym id>)` returns the 2–3 active + the 1 coming-soon; the **anon landing** `/en` + `/ar` shows the coach showcase **populated** (and the coming-soon teaser). No leak (unpublished coaches absent).

## Out of scope
COACH-LP's functions/UI; the photo gate (separate slice); anything beyond the demo data.

## Hygiene
Branch `prompt-coach-showcase-seed` off `main`; numbered migration; **no Claude/Co-Authored-By trailer**; **DO NOT merge** — report "COACH-SHOWCASE-SEED ready" + the VF/reseed evidence + a screenshot or `get_landing_coaches` count. (Note: redefining `reseed_proline_demo` is non-destructive on apply; the wipe+reseed only runs on the deliberate `SELECT`.)

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / COACH-SHOWCASE-SEED`: which coaches published, the reseed evidence, and a one-line PASS/FAIL ("anon landing showcase populated after reseed").
