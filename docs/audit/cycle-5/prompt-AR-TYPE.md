# CODER PROMPT AR-TYPE — Arabic typography fidelity (reuse dabbira's validated setup)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-ar-type` off `main`. **Frontend/CSS only; no backend.** **Owner-directed: reuse the Arabic-first setup proven in the sibling `dabbira` project.** proline already uses **IBM Plex Sans Arabic** (same font dabbira validated over Tajawal/Cairo) but loads it thin and applies a Latin type ramp → Arabic reads faint/cramped. Match dabbira's per-script typography.

## Reference dabbira directly (sibling project, in the workspace)
- Font config: `/Users/techstack/Desktop/Agentics/Projects/dabbira/src/app/layout.tsx:25-29`
- Per-script type scale: `/Users/techstack/Desktop/Agentics/Projects/dabbira/src/app/globals.css:306-323`
- RTL/Arabic rulebook (acceptance criteria): `/Users/techstack/Desktop/Agentics/Projects/dabbira/design/system/rtl-arabic.md`

## Build (apply the dabbira equivalent to proline)
1. **Font subset + weights** — [`src/app/[locale]/layout.tsx:20-25`](src/app/[locale]/layout.tsx#L20-L25): add **`'latin'`** to the IBM Plex Sans Arabic `subsets` (currently `['arabic']`) and load weights **400/500/600/700** (currently 400/500/700) — so Western numerals + embedded Latin (brand, codes) render in the same superfamily inside Arabic UI. Keep `display:'swap'` + the existing `--font-arabic` variable.
2. **Per-script type scale** — `src/app/globals.css`: add a `[dir="rtl"]` block (mirror dabbira `globals.css:306-323`): Arabic `--text-*` sizes bumped (~13/15/16/19/22/26/32px), line-heights looser (`--text-base--line-height: 1.7`, ramp ~1.65→1.4), and **`[dir="rtl"] body { font-weight: 500 }`** (Arabic body medium, not normal — warmer/clearer).
3. **No letter-spacing on Arabic** — add `[dir="rtl"] [class*="tracking-"], [dir="rtl"] h1,h2,h3,h4 { letter-spacing: 0 !important }` (tracking degrades Arabic; dabbira audit A2).

## Out of scope
The bidi `<bdi>`/`dir=auto` markup (separate AR-BIDI slice); the logical-property RTL sweep (RTL-LOGICAL); the i18n string leaks (I18N-AR); `/en` + `/fr` ramps (leave Latin unchanged).

## Verify
1. `/ar` renders with **larger, medium-weight (500), looser-line-height (1.7) Arabic body + bigger heading ramp + zero letter-spacing**; `/en` (+`/fr`) **unchanged**.
2. **No CLS regression on the hero** ([[arabic-fontswap-rewrap-cls]] — the reserved subheadline line still holds with the new scale; re-check the ax1 `/ar` CLS assertion at 1280×720).
3. **TARGETED run** (`-f projects="<ax1 + a representative /ar surface>"`) — the existing `/ar` CLS/render assertions stay green.

## Acceptance
1. Arabic type matches the dabbira-validated model (latin subset, per-script scale, body weight 500, line-height 1.7, no tracking); `/en`+`/fr` unchanged; no hero CLS regression; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-ar-type` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **validate TARGETED** + watch the `/ar` CLS; **DO NOT merge** — report "AR-TYPE ready" + run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / AR-TYPE — Arabic typography (dabbira-validated)`: the font-subset + per-script-scale + no-tracking changes, the dabbira references reused, the CLS re-check, the run ID, an explicit **"Arabic reads at 500/1.7/no-tracking per dabbira; /en+/fr unchanged; no hero CLS regression: PASS/FAIL"** line, and a DRAG READ.
