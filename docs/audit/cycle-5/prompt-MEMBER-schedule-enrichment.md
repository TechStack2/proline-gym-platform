# CODER PROMPT MEMBER-ENRICH — surface class + discipline (+ belt/status) on member cards & schedules

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-member-enrich` off `main`. **Zero schema — read-time only.** Demo feedback: from the **member cards and the schedules**, the owner wants to see more at a glance — **what class & discipline a student is in**, plus belt + membership status. (More member/schedule feedback is coming — see "Extensible" below.)

## Audit (verified — the data mostly exists, it's just not surfaced)
- **Member-360** ([students/[id]/page.tsx](../../src/app/[locale]/(dashboard)/students/[id]/page.tsx)) fetches `class_registrations` with the **class name** but **not the class's discipline**; it has `belt_promotions` (with disciplines) + memberships + PT. So the discipline of the *enrolled class* isn't shown.
- **Member list** ([students/page.tsx](../../src/app/[locale]/(dashboard)/students/page.tsx)) and the **schedule/roster** ([schedule/page.tsx](../../src/app/[locale]/(dashboard)/schedule/page.tsx)) don't surface class / discipline / belt per member.

## Build — surface existing data; add only the `class → discipline` join (read-time)
1. **Member list cards** (`students/page.tsx`): each member shows, at a glance — **discipline(s) + active class(es)**, **belt rank**, and **membership status** (active / expiring / lapsed). Join `class_registrations → classes → disciplines`. Keep it scannable (chips), not crowded.
2. **Member-360 enrollments panel**: show each registration as **class + discipline + schedule day/time** (add the `classes → disciplines` join the panel currently lacks). Belt + membership status already on the page — make sure they read clearly.
3. **Schedule / roster** (`schedule/page.tsx`): on a class's roster (the enrolled students), show each student's **discipline + belt** so the floor view is informative.

All gym-scoped, read-time; reuse existing queries + add the discipline join. i18n ar/en/fr; RTL; design-system; don't crowd the cards.

## Extensible (more feedback incoming)
Structure the member-card + roster "info area" so additional per-member fields (the operator's forthcoming feedback) drop in **without re-plumbing** — a small, ordered set of labeled chips/rows fed by one read query, not hard-coded one-offs. Flag in the drag-read where the next fields would attach.

## Out of scope
Schema; write paths (this is display-only); the 360 horizon cards ([2]/DRILL-360 owns those); offline/parity.

## Verify (e2e, ephemeral TI gym)
1. Seed a member enrolled in a class of a known discipline with a belt + active membership → the **member list card** shows discipline + class + belt + status; **Member-360** enrollments show class **+ discipline** + schedule; the **class roster** shows the student's discipline + belt.
2. `/ar` clean (RTL chips read correctly); full suite green (no regression).

## Acceptance
1. Member cards + schedule/roster + Member-360 enrollments surface class/discipline/belt/status from live data; green in E2E CI (run ID/URL).
2. Zero schema; read-time only; the info area is extension-ready; i18n ar/en/fr; RTL; design-system.

## Hygiene
Branch `prompt-member-enrich` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "MEMBER-ENRICH ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / MEMBER-ENRICH — class/discipline on member cards & schedules`: what was surfaced where, the discipline join added, the extension point for incoming feedback, CI run ID/URL, an explicit **"class+discipline+belt+status visible on member cards/roster/Member-360: PASS/FAIL"** line, and a DRAG READ.
