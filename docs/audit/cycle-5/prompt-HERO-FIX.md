# CODER PROMPT HERO-FIX — rebalance the landing hero (image sidelines the text at wide viewports) + a regression guard

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-hero-fix` off `main`. **UI-uplift slice (owner-reported, customer-facing). Frontend/landing only.** **Benchmark gap (acquisition):** the landing hero is top-of-funnel; the owner reports the hero image has "moved to its own container and sidelined the hero text" at wide width — text reads right-shifted, image bounded left. **This has recurred** ("unbalanced hero overlay" was fixed once at `ax3`), so the fix must include a **guard**.

## Why — the code says centered overlay; the render doesn't (diagnose-first)
[`src/components/marketing/HeroSection.tsx`](src/components/marketing/HeroSection.tsx) on `main` is a **centered full-bleed overlay**, NOT a 2-column split: a `fill object-cover object-center` background image (~:22-30), absolute-inset gradient/glow overlays (~:37-43), and a centered content block (`relative z-10 mx-auto max-w-7xl px-4 … text-center`, ~:46). It hasn't changed since `stabilize-2` — so **prod runs exactly this**, and the live HTML has `object-cover` + `text-center`. Yet the owner's wide-viewport screenshot shows the image bounded to the left and the text shifted right. **So this is a render/balance issue at wide viewports, not an obvious code 2-column — reproduce it before fixing.**

## Step 1 — DIAGNOSE (reproduce at the owner's width; report the cause)
Reproduce at a **wide/ultra-wide viewport** (e.g. 2560–2880px — the screenshot was 2880). Determine why the `fill` image renders sidelined / the text isn't truly centered. Candidates to confirm/rule out:
- the `fill` image's containing block at ultra-wide (does `relative min-h-screen` give it full width+height, or does something bound it to a band?);
- `object-position` / the "crops to a vertical band" comment (~:20) — is the visible band landing left instead of centered at ultra-wide?
- a `max-w-*` on the section/image wrapper bounding the image while the centered text floats beside it;
- the gradient/glow overlays masking the right so the image only *reads* as left-bounded;
- any wrapper/parent (the marketing page section) imposing a flex/grid that splits image vs content.
Write the actual root cause in the report (with the viewport it reproduces at).

## Step 2 — FIX (minimal, matched to the diagnosis)
Make the hero read as a **balanced full-bleed image with genuinely centered content at every width** (mobile → desktop → ultra-wide): the image covers the section edge-to-edge behind the centered text; the text block is horizontally centered on the page. Preserve the **CLS stabilization** ([[arabic-fontswap-rewrap-cls]] — keep the subheadline 2nd-line reserve, ~:82) and the readability wash.

## Step 3 — GUARD (so it stops recurring)
Add a regression check: an e2e assertion at a **wide viewport** that the hero content is centered (e.g. the H1/CTA block is horizontally centered within the section, not offset to one side) and the image is full-bleed — fails on the sidelined bug, passes on the balanced fix. (This is the third time the hero balance has slipped; lock it.)

## Out of scope
The landing classes/schedule (separate LANDING-CLASSES slice); other marketing sections; copy changes; RLS/data.

## Verify
1. Hero is **balanced at mobile, desktop, AND ultra-wide** (≥2560px) — full-bleed image, centered text, no sidelining; reproduced-then-fixed (root cause named, not guessed).
2. `/ar` (RTL) + `/en` correct; CLS stabilization intact (no subheadline reflow on font-swap).
3. The wide-viewport guard asserts centering and **fails on the old bug**.
4. Validate with a **TARGETED run** (`-f projects="<landing/marketing>"`).

## Acceptance
1. Landing hero reads as a balanced full-bleed centered overlay at all widths incl. ultra-wide; root cause diagnosed + minimally fixed; CLS intact; a wide-viewport regression guard added; `/ar`+`/en`; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-hero-fix` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **diagnose before fixing**; **validate TARGETED, not full** (cost); **DO NOT merge** — report "HERO-FIX ready" + the diagnosis + the targeted run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / HERO-FIX — rebalance the landing hero`: the **diagnosis** (root cause + the viewport it reproduces at), the minimal fix, the regression guard, the targeted run ID, an explicit **"hero balanced mobile/desktop/ultra-wide; root-caused not guessed; CLS intact; guard added: PASS/FAIL"** line, and a DRAG READ (top-of-funnel; a broken hero reads as a broken gym; this is its 3rd recurrence — now guarded).
