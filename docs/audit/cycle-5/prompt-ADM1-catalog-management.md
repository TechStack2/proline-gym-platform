# CODER PROMPT ADM-1 — Catalog management repair: class edit/archive + landing-publish switch + coach CRUD + disciplines SSOT + affiliations

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** demo-critical, jumps ahead of the already-issued B3 (operator found these in manual testing 2026-06-11; B3 runs immediately after — its migration takes the number AFTER this one's). Branch `prompt-adm1-catalog` off current `main`.

## Strategic context
The operator's demo story is "manage your catalog from admin and watch it propagate" — and the management half is broken: classes can't be edited or deleted, coaches can't be added (phantom-column write) or removed, and there's no way to stage a class without it instantly appearing on the public landing. Same AR/UX-1 bug-class (UI written against an imagined schema). **Tenant-clean rule:** the disciplines list (Muay Thai, Kick Boxing, Boxing, MMA) is PROLINE's per-gym DATA in the `disciplines` table — never a platform constant; other gyms will have different lists.

## Diagnosed defects (verified by auditor)
- `coaches/components/coach-form.tsx` writes `bio` — the schema has `bio_ar/bio_en/bio_fr` (+ `specialization_ar/en/fr`, `is_active`, `deleted_at`) → PGRST204 "bio not in schema cache". Audit the WHOLE form against the real table.
- No edit/delete on classes; no deactivate on coaches.
- Landing publishes every active class immediately (anon policy gates only `is_active`/active gym) — no staging.
- Affiliation logos are now real files in `public/landing/affiliations/`: **`lmf.jpg`, `ifma.png`, `lmmaf.png`, `mma-lebanon.jpg`** (no arab-muaythai — drop that slot). They are untracked — wire AND commit them.

## Build

### 1. Migration (next number) — landing-publish switch
- `classes.show_on_landing BOOLEAN NOT NULL DEFAULT false`.
- Tighten (never widen) the anon policies from 000035: `classes_public_read` additionally requires `show_on_landing`; `is_public_class()` (gates `class_schedules_public_read`) additionally requires it. Disciplines/membership_plans policies unchanged. Logged-in/staff visibility unchanged — this flag ONLY controls the public landing.
- Update `seed_e2e_gym` so the seeded class is `show_on_landing = true` (keeps the LP anon test meaningful).

### 2. Classes — edit + archive + publish toggle
- **Edit:** reuse the UX-1 wizard in edit mode (prefilled basics/schedule/pricing; update `classes`, replace `class_schedules` for that class). Entry from class detail + list row.
- **Archive (never hard-delete):** action sets `is_active=false` (+ status per enum) → class leaves timetable, landing, and wizard/coach chips; if ACTIVE registrations exist, show a count warning and require explicit confirm (registrations stay intact — staff handle members via existing B2 flows).
- **Publish switch:** "Show on landing" toggle in the wizard (step 3) and on class detail/list — flipping it is the demo moment (create → staff flips → it's live on the public page).

### 3. Coaches — fix add, enable edit/deactivate
- Repair the coach form against the REAL schema: localized bio fields (one textarea per locale or a locale-tabbed input — match the class wizard's names pattern), and **specialty = tappable chips from the gym's `disciplines`** (SSOT — no free-text, no hardcoded list), stored into `specialization_ar/en/fr` as the selected disciplines' localized names (a join table is V2/white-label). No dropdowns (UX-1 convention).
- **Deactivate (never hard-delete):** `is_active=false` + `deleted_at` → hidden from active lists, wizard coach chips, diary columns; if the coach has active classes or PT assignments, warn with counts and require confirm.
- Edit coach reuses the same repaired form.

### 4. Disciplines — SSOT everywhere
- Verify/repair the disciplines CRUD surface (Settings → Configuration → Disciplines; same phantom-column audit). Staff can add/edit/deactivate a discipline (archive pattern).
- Sweep: every discipline reference (class wizard chips, coach specialty chips, landing Disciplines section, timetable colors, filters) reads from the gym's `disciplines` rows — kill any hardcoded discipline list found.
- The Proline list (Muay Thai / Kick Boxing / Boxing / MMA — ar: مواي تاي / كيك بوكسينغ / ملاكمة / فنون قتالية مختلطة) is entered by the OPERATOR in admin once CRUD works (tenant data — do NOT bake it into code or migrations beyond the e2e seed).

### 5. Affiliations strip
Wire `AffiliationsSection` to the four real files (`lmf.jpg`, `ifma.png`, `lmmaf.png`, `mma-lebanon.jpg`; remove the arab-muaythai slot), keep the graceful text fallback, **commit the image files**.

## Out of scope
B3 content (guardian/payer — next slice, already issued); PT redesign (PT-360 design in progress by auditor); hard deletes anywhere; any weakening of RLS.

## Verify (e2e, ephemeral TI gym)
1. **Class lifecycle:** wizard-create (unpublished) → visible in admin timetable but **absent from the anon landing schedule** → flip Show-on-landing → **present on the anon landing** → edit (rename/retime) → timetable + landing update → archive → gone from timetable/landing/chips.
2. **Coach lifecycle:** add a coach (localized bio + discipline-chip specialty) → appears in wizard coach chips + diary → deactivate → gone from chips/diary; warning shown when deactivating the seeded coach with assignments (assert the warning, then cancel).
3. **Disciplines SSOT:** create a discipline in Settings → it appears in the class-wizard chips AND the anon landing Disciplines section; deactivate → gone from chips.
4. Affiliations strip renders the four logos (no 404s — assert the images load).
5. Full suite green — no regression (38+; the LP anon test now proves the publish gate via the seed flag).

## Acceptance
1. All three lifecycles (class edit/archive/publish, coach add/edit/deactivate, discipline CRUD) green in E2E CI (run ID/URL); publish gate proven anon-side.
2. Migration tightens anon read only; `database-reviewer` sanity: no new exposure.
3. No hardcoded discipline lists remain (state where they were found); no dropdowns introduced; archive-not-delete everywhere.
4. Logos committed + rendered; i18n ar/en/fr complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-adm1-catalog` off `main`; **dev port 3000** (operator tests on it — restart when you're done); scope every `git add` + `git show --stat` before push; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; apply the migration via Verify-Foundation before the e2e run; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / ADM-1 — Catalog management`: the publish-switch migration, the coach-form schema audit findings, where hardcoded discipline lists were killed, CI run ID/URL, an explicit **"Unpublished class hidden from anon landing until staff flips the switch: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **B3 family/household** (prompt already issued — `prompt-B3-family-household.md`; its migration takes the next number after yours).

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-adm1-catalog off main (git checkout main && git pull && git checkout -b prompt-adm1-catalog).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-ADM1-catalog-management.md

Demo-critical catalog repair (jumps ahead of the issued B3; B3's migration takes the number after yours).
Diagnosed: coach-form writes phantom `bio` (schema = bio_ar/en/fr + specialization_ar/en/fr) — audit the
whole form; classes have no edit/archive; coaches no deactivate; landing publishes every active class
instantly; affiliation logos are real untracked files in public/landing/affiliations/ (lmf.jpg, ifma.png,
lmmaf.png, mma-lebanon.jpg — no arab-muaythai).
Do: (1) MIGRATION (next number): classes.show_on_landing BOOL NOT NULL DEFAULT false; TIGHTEN the 000035
anon policies (classes_public_read + is_public_class() additionally require it; staff/logged-in
visibility unchanged); seed_e2e_gym's class gets show_on_landing=true. (2) Classes: edit via the UX-1
wizard in edit mode (update classes, replace class_schedules); archive (is_active=false, NEVER hard-
delete) with an active-registrations count warning + confirm; "Show on landing" toggle in wizard step 3 +
class detail/list. (3) Coaches: repair the form to the REAL schema — localized bios, specialty = tappable
CHIPS from the gym's disciplines (SSOT, stored into specialization_ar/en/fr; join table is V2), no
dropdowns; deactivate (is_active=false + deleted_at) hides from lists/wizard chips/diary, with
active-classes/PT-assignments warning; edit reuses the form. (4) Disciplines SSOT: verify/repair the
Settings disciplines CRUD (same phantom-column audit); sweep ALL discipline references (class wizard,
coach specialty, landing section, timetable colors, filters) to read from the gym's disciplines rows —
kill any hardcoded list and NAME where you found them. The Proline list (Muay Thai/Kick Boxing/Boxing/
MMA) is tenant DATA the operator enters in admin — do not bake into code. (5) Wire AffiliationsSection to
the four real files (drop the arab-muaythai slot, keep text fallback) and COMMIT the images. i18n
ar/en/fr, RTL, tenant-clean.
Verify in the E2E CI run, not tsc: wizard-create unpublished → in admin timetable but ABSENT from anon
landing → flip switch → PRESENT on anon landing → edit → updates propagate → archive → gone everywhere;
coach add with discipline-chip specialty → appears in wizard chips + diary → deactivate → gone (assert
the warning on the assigned seeded coach, then cancel); Settings-created discipline appears in wizard
chips + anon landing; affiliation images load (no 404); FULL suite green (38+, no regression). Apply the
migration via Verify-Foundation first. If the sandbox can't run the browser, push so e2e.yml runs and
report the run ID; do NOT fabricate. Dev port 3000; scope every git add + git show --stat; no Claude/
Co-Authored-By trailer; never weaken RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / ADM-1 — Catalog management": the
publish-switch migration, coach-form audit findings, killed hardcoded discipline lists (named), CI run
ID/URL, an explicit "Unpublished class hidden from anon landing until staff flips the switch: PASS/FAIL"
line, and a DRAG READ. Then STOP and tell me ADM-1 is ready for review.
```
