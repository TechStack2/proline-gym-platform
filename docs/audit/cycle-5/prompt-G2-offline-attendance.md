# CODER PROMPT G2-lean — Offline attendance (queue + sync)

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after F3 merges (branch `prompt-g2-offline` off post-F3 `main`). **The last V1 build slice.** Scope-locked **lean**: ONLY **attendance** works offline — NOT a general offline-first sync engine for payments/registrations/PT (those stay online-only). The gym (Hadath, Lebanon) has real power/internet gaps; marking who showed up to tonight's class must survive zero internet.

## Strategic context
Attendance is the one flow that physically cannot wait for connectivity — a coach marks a class in real time, and Lebanese internet drops. The blueprint promised offline-first; V1 delivers it where it matters most: **mark attendance offline → queue locally → auto-sync on reconnect**, idempotently. **First task: audit what offline scaffolding already exists** (the stack lists Dexie.js/IndexedDB + a sync-engine intent; CLAUDE.md) — build on it, don't duplicate. Mind the stale-service-worker history ([[stale-sw-localhost]] — DevSwCleanup heals dev; prod SW is the offline enabler). **Tenant-clean; follow `docs/design-system.md`; Arabic-first.**

## Build

### 1. Local store + queue (IndexedDB/Dexie)
- Audit existing Dexie schema/sync code first; reuse it. If absent, add a minimal Dexie store: a **roster cache** (today's classes + enrolled students, written whenever the attendance page loads online) and a **pending-marks queue** (class_id, student_id, attendance_date, status, client_ts).
- **No new server schema** — flushing uses the EXISTING attendance write path (the IA-1/REP-1 upsert keyed `class_id,student_id,attendance_date`, which is idempotent → re-flush is safe).

### 2. Offline-capable attendance marking (staff + coach surfaces)
- On load **online:** fetch + cache the roster for the day's classes.
- On mark **online:** write through to the server as today (no behavior change) AND keep the local cache coherent.
- On mark **offline:** write to the pending queue + optimistic UI (the student shows marked), with a clear **"offline — N pending"** indicator (badge + banner). The coach keeps working with zero internet.
- The attendance **route + its cached roster must be reachable offline** (PWA runtime caching / app-shell — verify the SW caches the route; don't regress the DevSwCleanup dev-heal).

### 3. Sync on reconnect
- A flush routine triggered on the `online` event AND on attendance-page load: drain the queue through the existing write path, oldest-first; on success remove from queue; on per-item failure leave it queued + surface it (never lose a mark, never block the others — best-effort per item).
- **Idempotent + last-write-wins** at the field level via the existing upsert — a double-flush or a server-side change can't create duplicates. Pending count returns to 0 when drained.

### 4. Out of scope
Offline for payments/registrations/PT/billing/anything else (online-only — show a clear "needs connection" state if attempted offline); background sync push; multi-device merge beyond the idempotent upsert; conflict UI (last-write-wins is the V1 rule).

## Verify (e2e, ephemeral TI gym — Playwright `context.setOffline`)
1. **Offline mark + sync:** coach/staff loads attendance online (roster cached) → `setOffline(true)` → mark several students present/absent → UI shows them marked + "N pending" + offline banner → `setOffline(false)` → queue flushes → **reload from the server** (fresh context) shows the marks persisted → pending count = 0.
2. **Idempotency:** trigger a second flush (or re-mark the same) → no duplicate attendance rows (the upsert holds).
3. **Online path unchanged:** a normal online mark still persists immediately (no regression to IA-1/REP-1 attendance).
4. **Scope guard:** an offline attempt on an online-only surface shows the "needs connection" state, not a silent fail.
5. Full suite green — no regression (F3's count + G2 tests).

## Acceptance
1. The proofs green in E2E CI (run ID/URL) — offline marking and reconnect-sync demonstrated under `setOffline`.
2. Zero new server schema; flush uses the existing idempotent upsert; no RLS change.
3. SW/offline reachability verified without regressing dev SW cleanup; pending indicator localized.
4. i18n ar/en/fr; RTL; design-system; `tsc`+`build` clean.

## Hygiene
Branch `prompt-g2-offline` off post-F3 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / G2 — Offline attendance`: the existing-scaffolding audit, the queue/cache model, the flush+idempotency design, the SW reachability note, CI run ID/URL, an explicit **"Mark offline → queue → reconnect-sync → persisted, idempotent, no regression: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only — **the last V1 build slice.** Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: the auditor runs the **V1 readiness review** (no coder prompt — re-score, audits, demo prep) before deploy.

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms F3 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-g2-offline off main (git checkout main && git pull && git checkout -b prompt-g2-offline
— main must contain F3; verify the waiver tables exist before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-G2-offline-attendance.md

THE LAST V1 BUILD SLICE. Scope-locked LEAN: ONLY attendance works offline — NOT payments/registrations/
PT (online-only). ZERO new server schema (flush reuses the existing idempotent attendance upsert keyed
class_id,student_id,attendance_date). FIRST TASK: audit existing Dexie/IndexedDB/offline scaffolding
(the stack intends it) and build on it; mind the stale-SW history (DevSwCleanup heals dev — don't
regress it).
Do: (1) Local store: roster cache (today's classes + enrolled students, cached on online page load) +
pending-marks queue (class_id, student_id, attendance_date, status, client_ts) in IndexedDB/Dexie. (2)
Attendance marking offline-capable on staff + coach surfaces: online load caches the roster; online mark
writes through as today; OFFLINE mark → pending queue + optimistic UI + "offline — N pending" badge/
banner; the attendance route + cached roster reachable offline (PWA runtime cache / shell — verify the SW
caches it). (3) Sync on reconnect: flush on the `online` event AND on attendance-page load — drain
oldest-first through the EXISTING write path, best-effort per item (a failure leaves that item queued,
never blocks others, never loses a mark), idempotent + last-write-wins via the upsert; pending → 0 when
drained. (4) Out of scope: offline for payments/registrations/PT (show "needs connection"); background-
sync push; conflict UI (LWW is the rule). i18n ar/en/fr, RTL, design-system, tenant-clean.
Verify in the E2E CI run, not tsc (Playwright context.setOffline): load attendance online (roster cached)
→ setOffline(true) → mark several students → UI marked + "N pending" + offline banner → setOffline(false)
→ flush → a FRESH server-side context shows the marks persisted + pending=0; second flush / re-mark → no
duplicate rows (upsert holds); a normal online mark still persists immediately (no IA-1/REP-1 regression);
an online-only surface attempted offline shows "needs connection"; FULL suite green (no regression). If
the sandbox can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port
3000; scoped git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your
branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / G2 — Offline attendance": the existing-
scaffolding audit, queue/cache model, flush+idempotency design, SW reachability note, CI run ID/URL, an
explicit "Mark offline → queue → reconnect-sync → persisted, idempotent, no regression: PASS/FAIL" line,
and a DRAG READ. Then STOP and tell me G2 is ready for review.
```
