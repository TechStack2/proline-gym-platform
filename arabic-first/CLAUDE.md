# Dabbira — Project Context & V2 Design Workflow

> If you already have a `CLAUDE.md`, **merge** the sections below into it, or save
> this file as `design/CONTEXT.md` and add a line `@design/CONTEXT.md` to your
> existing `CLAUDE.md`. Do not blindly overwrite an existing file.

## What Dabbira is

An **Arabic-first** PWA for Lebanon connecting **property owners** with **service
providers**, plus a **materials marketplace** whose products can be referenced
inside provider offers. Money is **off-platform**: cash + lead-gen + ratings +
verification (no in-app payments/escrow). The app's job is matchmaking, trust
signals, and clear communication.

## Stack

- Next.js 16 (App Router, React 19, RSC + Server Actions), TypeScript strict
- Tailwind CSS v4, CSS-first config (`@theme inline` + CSS variables in
  `globals.css`); **no** `tailwind.config.js`. `cn()` = clsx + tailwind-merge;
  CVA for variants; `tw-animate-css`
- shadcn/ui (`base-nova`, base color `neutral`) vendored in `src/components/ui/`,
  built on **Base UI** (`@base-ui/react`) — **not** the Radix-based shadcn
- lucide-react, sonner, next-themes
- i18n: locales `ar` / `fr` / `en`; `<html dir>` set from locale (ar→rtl)
- **RTL today** is a hybrid: physical Tailwind utilities (`ml-`/`pr-`/`left-`)
  with a hand-written `[dir="rtl"]` override block in `globals.css` that flips
  each one, plus an Arabic font swap. It is brittle (only covers utilities added
  so far) and is the load-bearing piece for Arabic layout.

## The two-agent workflow (spec-driven)

- **Design Lead agent** (`.claude/agents/design-lead.md`): does research, IA,
  interaction design, design system, RTL/Arabic, content, and usability. Writes
  **only** to `/design`. Produces specs + HTML/Tailwind prototypes. Does **not**
  touch `src/`.
- **Coding agent** (you, in the main session): implements from the specs in
  `/design`. Treats `/design/INDEX.md` as the source of truth and builds against
  the acceptance criteria in each spec. Does not invent design decisions — if a
  spec is ambiguous, ask the Design Lead to resolve it in the spec, then build.

Handoff is **file-based**, via `/design` tracked in Git. See the
`design-handoff` skill for the exact contract and folder structure.

## Guiding principles for V2

1. **Arabic is canonical.** Design and write Arabic first; derive en/fr. A native
   Lebanese reviewer validates Arabic tone before content ships.
2. **Reach value fast.** Register late; let owners start a request before signup.
3. **Match the local trust model.** Support inspect-then-quote, not blind quoting.
4. **Meet users where they are.** Voice/photo/video request input (WhatsApp-native).
5. **Logical-properties direction.** New layout uses logical utilities so RTL is
   automatic and the manual flip block can be retired incrementally.
6. **Ship UI wins first.** Typography, copy, IA, progress states, and register-late
   don't depend on backend; sequence backend features (media, transcription,
   site-visit state, multi-select) behind them.

## The V2 thesis (the 5 moves)

Rich-media request input · inspect-then-quote · register-late · Arabic type +
language · guided triage with multi-select. Each is a hypothesis to validate with
the pilot panel before it is treated as settled.

## Hard rules

- Design Lead writes only inside `/design`. Coding agent builds only from `/design`.
- Every screen spec carries acceptance criteria including a **RTL pass**, a
  **real-Arabic-content pass** (use real Arabic, never Lorem Ipsum), and an
  **Arabic-typography check** (size, line-height, weight, no letter-spacing).
- Numerals in the Arabic UI are **Western (0-9)** unless the brand says otherwise.
