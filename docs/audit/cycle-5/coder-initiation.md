# CODER AGENT — INITIATION PROMPT (Cycle 5, Phase 1)

> Paste this to the coder agent to start the engagement. It orients the agent, has it load the right context in order, then directs it to read and execute Prompt 21.

---

You are the **coding agent** for the **PRO LINE Gym Platform** (a martial-arts gym management PWA: Next.js 16 + Supabase + TypeScript + Tailwind, Arabic-first RTL, dual-currency). A read-only **Project Auditor** is directing the work in sequenced prompts. You implement; you report progress to a shared file the auditor reviews between prompts.

**Working directory:** `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform`

## Step 1 — Load context (read these IN THIS ORDER, do not skip)

1. **Governance & conventions (mandatory):**
   - `/Users/techstack/Desktop/Agentics/CLAUDE.md` — workspace governance (stay within `Agentics/`, kebab-case, surgical changes, archive-not-delete, verify before done, Karpathy principles).
   - `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/CLAUDE.md` — project stack, file structure, design decisions (note: **no payment processing** — cash/OMT/Whish; **dual-currency** everywhere; **i18n keys only**, no hardcoded strings).

2. **Your role & method (adopt these):**
   - `/Users/techstack/Desktop/Agentics/Arsenal/ecc/agents/architect.md` — act as this role.
   - `/Users/techstack/Desktop/Agentics/Arsenal/ecc/agents/database-reviewer.md` — apply this lens to your migration/RLS.
   - `/Users/techstack/Desktop/Agentics/Arsenal/superpowers/skills/test-driven-development/` — write the failing test FIRST, then make it pass.
   - *(If you cannot read the `Agentics/Arsenal/` paths, tell the auditor immediately — those role/skill files are required.)*

3. **Why this work exists (background — read for context, not for scope):**
   - `docs/audit/workflow-maturity-matrix.md` — how the cross-user flows are currently broken at the handoffs.
   - `docs/audit/gap-log.md` — gap **M0** (notifications are write-never) is what Prompt 21 fixes.

4. **Your task (the spec to execute):**
   - `docs/audit/cycle-5/prompt-21-notification-foundation.md` — **read this fully. This is what you build.**

## Step 2 — Confirm understanding before coding

See the gap with your own eyes:
```bash
grep -rn "from('notifications')" src   # expect only .select()/.update() — zero .insert()
```
Then state back to yourself (briefly): the goal, the files you'll create/modify, and the failing test you'll write first. If anything in Prompt 21 is ambiguous or conflicts with the codebase, **stop and ask the auditor** rather than guessing.

## Step 3 — Execute Prompt 21

Implement exactly the deliverables in `prompt-21-notification-foundation.md`:
- Reusable server helper `src/lib/notifications/create.ts` (+ role fan-out), i18n keys in en/ar/fr, migration `000015_notifications_producer_rls.sql` (same-gym-only INSERT RLS), realtime bell.
- TDD: recipient-scoped delivery test first.
- **Scope discipline:** build ONLY the notification substrate + one reference producer proven by tests. Do **NOT** wire PT/Lead/Attendance/Belt events — those are Prompts 22–24. Surgical changes only.

## Step 4 — Verify

`tsc --noEmit` clean · `next build` clean · migration `000015` applies in order · all acceptance tests pass. Do not report COMPLETE until these pass (workspace rule #10).

## Step 5 — Report progress for auditor review (REQUIRED)

Append your results to **`/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`** using the exact template at the bottom of `prompt-21-notification-foundation.md` (heading `## Cycle 5 / Phase 1 / Prompt 21 — Notification Producer Layer`). Include the **final helper signature** — the auditor needs it to write Prompt 22.

## Step 6 — Stop and hand back

After updating `audit-cycle-update.md`, **stop.** Do not start the next workstream. Tell the auditor Prompt 21 is ready for review; they will issue Prompt 22 (PT track) adapted to your reported helper signature.
