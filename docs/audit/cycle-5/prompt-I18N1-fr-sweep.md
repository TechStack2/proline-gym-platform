# CODER PROMPT I18N-1 — Locale completeness sweep: fr (+ known ar/en gaps) (PARALLEL TRACK)

> **For:** the PARALLEL coding agent (Opus, worktree `../proline-rep1`) · **Issued by:** Project Auditor · **Sequence:** after LPX-1 (merged). Branch `prompt-i18n1-fr` off current `main` (`git fetch origin && git checkout -b prompt-i18n1-fr origin/main`).
> **PARALLEL RULES:** zero schema/RLS. **Surface: the three i18n message files + ONE smoke spec + its playwright project — nothing else.** No key renames, no namespace restructuring, no component changes (if a component hardcodes strings, REPORT it — don't fix it here). The mainline E1 slice is adding NEW camp namespaces concurrently — you edit EXISTING keys/values, so the merge is key-disjoint; expect trivial file-level merges the auditor resolves.

## Strategic context
French is a first-class locale for the Lebanese market (tri-lingual reality) and a tenant-facing white-label promise — but fr has been filled slice-by-slice and never audited whole. Known debt: the `students.cancel/female/gender/male` MISSING_MESSAGE gaps (logged since Cycle-5 start), plus suspected untranslated fr values (English copied verbatim) and en→fr/ar drift across 40+ slices of additive keys.

## Build
1. **Mechanical audit (script it, run it, include the output table in the audit log):** for each of `ar.json` / `en.json` / `fr.json` — keys present in `en` but missing in `fr` or `ar`; keys present in `fr`/`ar` but missing in `en` (orphans — report, don't delete); `fr` values byte-identical to `en` (untranslated suspects — human-judge each: brand names like "PRO LINE" legitimately match).
2. **Fill:** real French (and Arabic where missing) for every gap — gym-domain register (membre, abonnement, forfait PT, présence, ceinture, inscription); keep interpolation placeholders (`{count}` etc.) and ICU plural forms intact; Arabic stays the source-of-truth voice (don't "improve" existing ar values — fill only what's missing).
3. **The named known gaps:** `students.cancel/female/gender/male` resolved in all three files.
4. **Smoke spec (1 test, `i18n1` project):** logged-in pass through the main surfaces in **fr** (today, inbox, members list + one member file, schedule, money, settings; portal home; coach home) asserting no `MISSING_MESSAGE` and no raw-key leak (regex like `\w+\.\w+\.\w+` rendered as text); plus logged-out `/fr` landing.
5. **Report counts:** keys filled per file, untranslated-suspects fixed, orphans found, hardcoded-string components spotted (report-only list).

## Verify
Full suite green via `gh workflow run "E2E Verification (behavior-green gate)" --ref prompt-i18n1-fr` (queue-aware — the mainline E1 gate may be running; wait it out); report the run ID. `tsc`+`build` clean.

## Acceptance
1. Audit table + fill counts in the log; zero en-keys missing from fr/ar after the sweep; the four known gaps gone.
2. fr smoke green in CI (run ID/URL); no regression.
3. Diff touches ONLY the three JSONs + the spec + playwright config (the diff is the proof).

## Hygiene
Worktree only; port 3100; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / I18N-1 — fr completeness sweep (parallel)`: the audit table, fill counts, hardcoded-string report list, CI run ID/URL, an explicit **"fr complete + known gaps closed + smoke green: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only; report PASS/FAIL to the operator. After this the parallel lane likely FREEZES (mainline enters ON-1/G1 territory) — the auditor will confirm.

---

### Copy-paste activation block for the PARALLEL coder (Opus session)
```text
You are the PARALLEL coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-rep1 (worktree).
Setup: git fetch origin && git checkout -b prompt-i18n1-fr origin/main

Read in full and execute exactly:
  docs/audit/cycle-5/prompt-I18N1-fr-sweep.md

PARALLEL RULES: zero schema/RLS. Surface = src/i18n/messages/{ar,en,fr}.json + ONE smoke spec + its
playwright project — NOTHING else. No key renames, no restructuring, no component edits (hardcoded
strings → report-only). Mainline E1 adds NEW camp keys concurrently; you edit EXISTING keys only.
Do: (1) Script a mechanical audit (include its output table in the audit log): en-keys missing from
fr/ar; fr/ar orphans (report, don't delete); fr values byte-identical to en (untranslated suspects —
judge each; brand names legitimately match). (2) Fill real French (+ missing Arabic) in gym register
(membre/abonnement/forfait PT/présence/ceinture/inscription); preserve {placeholders} and ICU plurals;
do NOT rewrite existing ar values. (3) Close the known students.cancel/female/gender/male gaps in all
three files. (4) ONE i18n1 smoke spec: logged-in fr pass over today/inbox/members(+one file)/schedule/
money/settings + portal home + coach home + logged-out /fr landing — assert no MISSING_MESSAGE and no
raw-key text leak. (5) Report counts (filled per file, suspects fixed, orphans, hardcoded-string list).
Verify in CI: gh workflow run "E2E Verification (behavior-green gate)" --ref prompt-i18n1-fr (queue-
aware; the mainline E1 gate may be running — wait it out); report the run ID; full suite green; do NOT
fabricate. If main moves under you, finish on your base and report — the auditor owns merge order.
Scoped git add + git show --stat; no Claude/Co-Authored-By trailer.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / I18N-1 — fr completeness sweep
(parallel)": the audit table, fill counts, hardcoded-string report list, CI run ID/URL, an explicit
"fr complete + known gaps closed + smoke green: PASS/FAIL" line, and a DRAG READ. Then STOP and report
to the operator.
```
