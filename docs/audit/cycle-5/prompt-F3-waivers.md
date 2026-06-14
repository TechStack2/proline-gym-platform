# CODER PROMPT F3-lean — Waiver / consent record + signature capture

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after G1 merges (branch `prompt-f3-waivers` off post-G1 `main`). Scope-locked **lean**: a gym-configurable waiver/consent record with in-app signature capture — **NOT** a third-party e-sign integration (DocuSign etc.), no PDF generation (V2). Martial-arts gyms need a liability waiver on file; this records it.

## Strategic context
Combat-sport gyms require members (and a guardian for minors) to sign a liability waiver before training. Today there's nowhere to record it. F3-lean makes the waiver **gym-configurable content** (tenant-clean — Proline's waiver text is data, not code), captured at onboarding, with status visible to staff. Versioned so a wording change can require re-sign. **Follow `docs/design-system.md`; Arabic-first.**

## Build

### 1. Migration (next free number)
- **`waiver_templates`** (gym-scoped): title + body `ar/en/fr`, `version` INT, `is_active`, timestamps. Staff-write own-gym RLS; **authenticated read in gym** (members must read the text they sign); the active template is what gets signed.
- **`waiver_signatures`**: `student_id` (the member the waiver covers), `signed_by_profile_id` (the signer — the member, or the **guardian for a minor** per B3), `template_id` + `template_version` (snapshot at sign time), `signature` (see §3), `signed_at`, optional `user_agent`. Gym-scoped RLS: staff read own gym; the signer (and guardians via `is_guardian_of`) can read their own. Append-only (re-sign = new row); "current" = latest row for (student, active template version).

### 2. Waiver template editor (Settings → Configuration)
CRUD via the UX-2 `FormWizard` (title + localized body + activate); editing the body **bumps `version`** (so existing signatures become "outdated" and trigger re-sign). Archive pattern. Seed a default Proline waiver in `seed_e2e_gym` so the e2e has one.

### 3. Signing surface + capture
- **Signature capture:** a touch-first **canvas signature pad** (works on tablet/phone — the front-desk/onboarding context), persisted as a PNG (reuse the ADM-2 storage pattern — a `waivers` bucket path `<gym_id>/<student_id>-v<version>.png`, owner-or-staff write / gym-scoped read; OR base64 in the row if simpler — coder's call, name it) + a **typed-name + "I have read and agree" checkbox** as the legal consent anchor (always required; the drawn signature is the artifact). Capture `signed_at`.
- **Where it's signed:** a step in the **ON-1 onboarding wizard** (new members sign during first-login onboarding) AND a standalone **"Sign waiver"** prompt on the portal/Member-360 when a member is unsigned or outdated. **Guardian path:** for a minor, the guardian signs from their portal (kid-switcher → the kid's waiver), `signed_by_profile_id` = guardian (B3).
- Block nothing in V1 (record + surface; "must sign before training" enforcement is a gym-policy nicety for later) — but show the status prominently.

### 4. Status surfacing
- **Member-360:** a waiver chip — Signed (v N, date) / Unsigned / Outdated (signed v < active v). Tap → view the signed record / send a sign prompt.
- **Portal:** the member/guardian sees their waiver status + a sign CTA when unsigned/outdated.
- (Optional, cheap) a staff filter "unsigned waiver" on the Members list.

## Out of scope
Third-party e-sign; PDF export/email; legally-binding cryptographic signatures; hard enforcement gates; multi-document packets (one active waiver per gym in V1).

## Verify (e2e, ephemeral TI gym)
1. **Template:** staff create/activate a waiver in Settings → it's readable to a member in-gym; editing the body bumps the version.
2. **Sign (member):** a member signs (canvas + typed name + checkbox) → a `waiver_signatures` row with the correct `student_id`/`signed_by`/version + the artifact persists → Member-360 + portal show "Signed v N".
3. **Guardian signs for a minor:** guardian signs the kid's waiver → row has `signed_by_profile_id` = guardian, `student_id` = kid (assert via B3 guardian context).
4. **Outdated:** bump the template version → the member's status flips to "Outdated" with a re-sign CTA → re-sign creates a new row, status returns to Signed.
5. Full suite green — no regression (G1's count + F3 tests).

## Acceptance
1. The four proofs green in E2E CI (run ID/URL).
2. `database-reviewer`: signatures gym-scoped + signer/guardian-readable, template authenticated-read-in-gym, storage path owner-or-staff (if a bucket is used); append-only signatures.
3. Tenant-clean (waiver text is data); i18n ar/en/fr; RTL; design-system; `tsc`+`build` clean.

## Hygiene
Branch `prompt-f3-waivers` off post-G1 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations via Verify-Foundation before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / F3 — Waivers`: the template/version model, the signature-capture + storage choice, the guardian-signs-for-minor path, CI run ID/URL, an explicit **"Configurable waiver signed (member + guardian-for-minor) + version-bump re-sign + status surfaced: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **G2-lean** (offline attendance).

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms G1 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-f3-waivers off main (git checkout main && git pull && git checkout -b prompt-f3-waivers
— main must contain G1; verify src/lib/whatsapp/dispatch.ts exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-F3-waivers.md

Scope-locked LEAN: a gym-configurable waiver/consent record + in-app signature capture. NOT third-party
e-sign, NO PDF, NO hard enforcement gate.
Do: (1) MIGRATION (next free number): waiver_templates (gym-scoped: title + body ar/en/fr, version INT,
is_active) staff-write + authenticated-read-in-gym RLS; waiver_signatures (student_id, signed_by_profile_id,
template_id + template_version snapshot, signature artifact, signed_at, user_agent) gym-scoped RLS —
staff read own gym, signer + guardians (is_guardian_of) read their own, APPEND-ONLY (re-sign = new row);
seed a default Proline waiver in seed_e2e_gym. (2) Waiver editor in Settings → Configuration via the UX-2
FormWizard (title + localized body + activate); editing the body BUMPS version (existing signatures →
outdated). (3) SIGNING: touch-first canvas signature pad persisted as PNG (reuse the ADM-2 storage
pattern — waivers bucket <gym_id>/<student_id>-v<version>.png, owner-or-staff write / gym read; or base64
in-row, your call, name it) + typed-name + "I have read and agree" checkbox (always required); signed as
a STEP in the ON-1 onboarding wizard AND a standalone "Sign waiver" prompt on portal/Member-360 when
unsigned/outdated; GUARDIAN signs for a minor from their portal (kid-switcher), signed_by = guardian
(B3). Record + surface only (no blocking gate in V1). (4) STATUS: Member-360 waiver chip (Signed vN/date,
Unsigned, Outdated) + portal status + sign CTA; optional Members "unsigned" filter. Out of scope:
e-sign, PDF, crypto-signatures, enforcement, multi-doc packets. i18n ar/en/fr, RTL, design-system,
tenant-clean (waiver text is DATA).
Verify in the E2E CI run, not tsc: staff create+activate a waiver → member reads it in-gym + body edit
bumps version; member signs (canvas+typed+checkbox) → waiver_signatures row (correct student/signer/
version) + artifact persists → Member-360 + portal show Signed vN; guardian signs a minor's waiver →
signed_by = guardian, student = kid; version bump → member shows Outdated + re-sign → new row, back to
Signed; FULL suite green (no regression). Apply migration via Verify-Foundation with -f apply=true BEFORE
e2e. If the sandbox can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate.
Dev port 3000; scoped git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS;
stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / F3 — Waivers": the template/version
model, signature-capture + storage choice, guardian-for-minor path, CI run ID/URL, an explicit
"Configurable waiver signed (member + guardian-for-minor) + version-bump re-sign + status surfaced:
PASS/FAIL" line, and a DRAG READ. Then STOP and tell me F3 is ready for review.
```
