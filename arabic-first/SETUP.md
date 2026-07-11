# Dabbira V2 — Design Kit Setup

This kit turns a regular Claude Code (Opus) session into a **Design Lead** that does
all the UX, IA, RTL/Arabic, design-system, content, and usability work and hands
**implementation-ready specs** to your existing coding agent. It does **not** write
production code.

## 1. What's in the kit

```
CLAUDE.md                         # shared project context + the two-agent workflow
.mcp.json                         # browser MCP (Playwright) + Figma placeholder
.claude/agents/design-lead.md     # the Design Lead subagent
.claude/skills/
  ux-audit/                       # audit method + severity scale
  rtl-arabic-design/              # RTL + Arabic typography rulebook (the load-bearing one)
  arabic-first-content/           # Arabic-canonical microcopy
  design-system-tokens/           # tokens + component specs
  flow-spec/                      # wizard/flow specs + HTML prototypes
  usability-test-protocol/        # moderated tests with your pilot panel
  design-handoff/                 # the spec contract + Definition of Done
design/                           # where the agent writes everything (source of truth)
  README.md
```

## 2. Install

1. Open your Dabbira repo in VS Code; copy this kit's contents into the **repo root**
   (so you get `./.claude/`, `./design/`, `./.mcp.json`).
   - **CLAUDE.md:** if you already have one, **merge** this content in, or save it as
     `design/CONTEXT.md` and add `@design/CONTEXT.md` to your existing `CLAUDE.md`.
2. **Browser MCP:** Playwright is preconfigured (`npx @playwright/mcp@latest`).
   Approve it when Claude Code prompts on first run.
3. **Figma MCP:** add it the official way rather than hand-editing the placeholder —
   from Claude Code, run `claude mcp add` and follow Figma's remote MCP / connector
   OAuth flow (see Figma's MCP docs). Then either fill the real endpoint into
   `.mcp.json` or remove the `figma` placeholder if you connected via the UI.
4. Start Claude Code in the repo root and run `/agents` to confirm **design-lead**
   is registered. (If you add or edit agent files mid-session, restart the session.)

## 3. How to use it

- **Invoke explicitly** — auto-routing to custom agents is unreliable and Opus tends
  to over-delegate, so call it by name:
  > Design Lead, load the pilot and audit the request wizard and onboarding.
- Keep the coding agent in your **main** session; point it at `design/INDEX.md` and
  have it implement only specs marked `ready`.
- Work in **phase gates** — review the agent's output at the end of each phase before
  it moves on.

## 4. V2 run order (worst-first, incremental)

1. **Discover** — Design Lead loads the live app, maps the as-is flows (including the
   not-yet-documented materials-in-offer flow), and writes `design/audit/audit.md`.
2. **Research** — it writes a moderated-test protocol; **you run** ~4–5 owners and
   your 3–5 providers (Arabic sessions for Arabic users); it synthesizes findings.
3. **Define** — IA, `tokens.json` (incl. the Arabic per-script type scale), the
   RTL/Arabic spec, and the trilingual copy deck (Arabic canonical).
4. **Design** — flow specs + HTML/Tailwind prototypes for the priority flows.
5. **Validate** — put prototypes in front of a few panel users **before** coding.
6. **Handoff** — specs go to `/design` marked `ready`; the coding agent builds; QA
   against acceptance criteria, including the RTL, real-Arabic, and Arabic-typography
   checks.
7. **Ship → measure → repeat** on the next flow.

## 5. Assumptions I baked in (correct any of these)

Because three scoping questions were still open, the kit assumes:

- **(Q12 scope)** V2 = a focused redesign of the core loop — onboarding → request →
  offer → site-visit → completion → rating — done worst-first and incrementally, with
  no fixed deadline.
- **(Q13 coding agent)** Your coding agent can do **both** UI and backend (full-stack
  Next.js). So specs may include backend features (media upload/storage, voice
  transcription, a site-visit state, a multi-select request model) — but each spec
  marks UI-only vs backend and sequences so **UI-only wins (typography, copy, IA,
  progress states, register-late) ship first**, independent of backend. If your coding
  agent is UI-only, the kit still works — just defer the backend-tagged specs.
- **(Q7 materials flow)** Not yet documented, so the agent's first task includes
  mapping it from the live app before redesigning it.
- **(Q8 / Q14)** One Design Lead agent (not a multi-agent team); it handles both
  owner and provider journeys in the IA.

## 6. Still worth your input

- **Q7** — a quick description of the current "specify materials in an offer" flow
  speeds up the agent's audit.
- **Q12 / Q13** — confirm or correct the scope and coding-agent assumptions above.
- A **native Lebanese Arabic reviewer** for the copy deck (the agent drafts; a human
  validates tone). And the providers as your **font A/B** testers.

## 7. Optional hardening

- To *enforce* "Design Lead never touches `src/`," add a Claude Code **PreToolUse
  hook** that blocks writes outside `design/`. Instruction-level guarding is in place;
  a hook makes it airtight.
