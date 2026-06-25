# CODER PROMPT SHELL-IA — kill the header/title echo + fix mobile edge-padding across the dashboard shell

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-shell-ia` off `main`. **UI-uplift slice (owner-directed). Frontend/shell only — no backend/RLS/data.** **Benchmark gap (UX polish, V1 feel):** every dashboard page shows the page name **twice** on mobile (the native large title + a content H1 right under it) and many pages sit **flush against the screen edge** — both read as unfinished. **Owner-chosen pattern: "large title owns it; content leads with context."**

## The two problems (root-caused via recon)
1. **Title echo (mobile-only).** On mobile, `NativeHeader` renders an iOS-style large title from the nav key ([`src/components/native/NativeHeader.tsx`](src/components/native/NativeHeader.tsx) ~:171), and each page *also* renders a content H1 of the same name — e.g. [`today/page.tsx:59`](src/app/[locale]/(dashboard)/today/page.tsx#L59), [`inbox/page.tsx:155`](src/app/[locale]/(dashboard)/inbox/page.tsx#L155), [`students/page.tsx:177`](src/app/[locale]/(dashboard)/students/page.tsx#L177). The chrome title source is [`_components/DashboardLayoutClient.tsx:56-58`](src/app/[locale]/(dashboard)/_components/DashboardLayoutClient.tsx#L56-L58).
   - **CRITICAL — desktop has no chrome title.** `Header.tsx` (desktop) renders no title, so on desktop the content H1 is the **only** title. **Do NOT just delete the H1** — that would leave desktop title-less.
2. **Mobile edge padding.** The shell's mobile content wrapper has no horizontal padding ([`DashboardLayoutClient.tsx:83-95`](src/app/[locale]/(dashboard)/_components/DashboardLayoutClient.tsx#L83-L95) — bottom only). Pages are supposed to add `p-4 md:p-0` themselves; ~14 don't (students, attendance, schedule, classes, leads, invoices, payments, desk, belts, pt, rentals, reports, settings, profile…) → flush-left.

## Build — apply the owner-chosen pattern, consistently, across EVERY `(dashboard)` page
1. **Title echo → responsive single title.** The page name must appear **exactly once per breakpoint**:
   - **Mobile:** the `NativeHeader` large title is the title → **hide the page's content H1 on mobile** (`hidden md:block` on the H1, or equivalent) and have the content **lead with its context** directly under the large title: Today → the date ("Thursday, June 25"); Inbox → the status line ("Inbox zero — nothing waiting"); Members/Students → the tabs (Active/Prospects) + a one-line count ("42 active · 11 owing"); apply the same spirit to every page (promote the existing sub-context, or add one concise context line — never re-print the name).
   - **Desktop:** the content H1 stays (it's desktop's only title). So the title element is shown `md:` up, hidden on mobile.
   - Localize every context line (`ar` RTL / `en` / `fr`).
2. **Mobile padding → fix ONCE at the shell.** Add base horizontal padding to the shell's mobile content wrapper (`DashboardLayoutClient.tsx` ~:83-95, e.g. `px-4 md:px-0`) and **remove the per-page `p-4`/`p-4 md:p-0`** so there's no double-padding (desktop padding stays from [`layout.tsx:60`](src/app/[locale]/(dashboard)/layout.tsx#L60)). Single source of truth; every page gets consistent mobile edge spacing.
3. **Consistency:** the result is uniform across all dashboard pages — one title per breakpoint, a meaningful context lead, even edge padding. Match the existing native styling.

## Out of scope
- The member/parent **portal** shell (separate; if it has the same echo, that's a follow-up — note it, don't fix here).
- Backend/RLS/data; the desktop `Header.tsx` search/notif/logout; what any page *does*; the landing hero (separate HERO-FIX slice).

## Verify
1. On **mobile**: each dashboard page shows the page name **once** (the large title) with the content leading on context, **no echoed H1**; on **desktop**: the page name still shows (content H1) — never title-less.
2. **Mobile horizontal padding** is consistent on every page (no flush-left); no double-padding anywhere; desktop spacing unchanged.
3. `/ar` (RTL) + `/en` (+ `/fr`) correct on the context lines.
4. **e2e:** any spec that located a now-hidden content H1 must be **re-pointed** to the `NativeHeader` title or the context element — **do NOT weaken assertions** (the title still exists, just in the chrome on mobile). Validate with a **TARGETED run** over the dashboard projects (E2E-TIERED: `-f projects="…"`).

## Acceptance
1. One title per breakpoint on every dashboard page (mobile = large title + context lead; desktop = content H1), consistent mobile edge padding (shell-owned), `/ar`+`/en` correct, specs re-pointed not weakened; frontend/shell only — no backend/RLS; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-shell-ia` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **never weaken an assertion** (re-point instead); **validate TARGETED, not full** (cost); **DO NOT merge** — report "SHELL-IA ready" + the targeted run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / SHELL-IA — header/title echo + mobile padding`: the responsive single-title pattern, the shell-level padding fix, the pages swept, any specs re-pointed, the targeted run ID, an explicit **"one title per breakpoint (desktop never title-less); consistent mobile padding; /ar+/en; no weakened assertion: PASS/FAIL"** line, and a DRAG READ.
