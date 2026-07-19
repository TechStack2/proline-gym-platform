# DESIGN SYSTEM 2.0 — the binding spec (Phase 2)

**Status:** DRAFT pending owner approval of the pixel reference ([`design-system-2-reference.html`](design-system-2-reference.html) — the approval artifact). Owner approval of that artifact **gates Wave 1**.
**Authority chain:** [Phase-1 audit](../design-audit/2026-07-audit.md) §Synthesis defines the problem (8 root causes); this spec defines the solution; every Wave 1–4 execution slice cites the section that authorizes it (Appendix A maps them).
**Relationship to DS-1/2/3:** this spec **evolves** the existing foundation — channel-var neutrals + `html.dark` inversion (DS-2), per-role shell hues (DS-1/WL-CHROME), Geist + IBM Plex Arabic with the ×1.13 RTL ramp (DS-1/AR-TYPE), fixed-vs-flipping surfaces (DS-3). Nothing here replaces those; every section states what it adds on top.
**Out of scope:** Wave 0 (Lane B, in flight) is mechanical correctness on the *current* design (DA-1/2/5/6/9/10/15-name/20/21/35). This spec assumes those fixes land and does not re-specify them.

---

## §1 Token doctrine

### 1.1 The literal ban (the Wave-4 lint rule)

**Rule: no color literal outside token files.** After Wave 4, the following fail lint anywhere in `src/` except the allowlist:

- Raw hex/rgb/hsl in class names: `text-[#…]`, `bg-[#…]`, `border-[#…]`, `from-[#…]`, `ring-[#…]`, `shadow-[…#…]`
- Raw hex in TS/TSX string literals that reach `className`/`style`
- New `dark:` variants in tenant surfaces (the channel-var flip owns dark; `dark:` fights it — the audit found exactly one legitimate-looking `dark:` and it was a bug)

**Allowlist (the only files that may contain color literals):** `src/app/globals.css`, `tailwind.config.ts`, `src/lib/theme/brand.ts`, `src/lib/design-tokens.ts`, `public/offline.html` (until its Wave-2 tenant-neutral pass), email/print templates that never render in-app.

**Named exceptions become tokens, not literals:** WhatsApp green → `--c-whatsapp: 37 211 102` (+ `--c-whatsapp-deep`); the gold belt gradient stays as the existing `.text-belt-gradient` utility (already in globals.css). If a hue is worth using, it is worth naming.

Enforcement: an ESLint rule (or a `scripts/lint-color-literals.mjs` grep gate wired into `npm run lint`) with the allowlist inline. Wave 1–3 slices must not add new violations; Wave 4 drives the count to zero and turns the gate on.

### 1.2 The fixed-token rule (DS-3, generalized)

Some surfaces are **designed-fixed**: they look the same in both themes because their look *is* the design. Today this is handled twice, ad hoc (landing `.landing-dark` re-pins channel vars; the receipt pins the LIGHT ramp). Generalize to two named utilities in globals.css:

- **`.surface-fixed-dark`** — pins the neutral channel vars to their designed-dark values inside the subtree, in *both* themes. Users: landing hero, landing footer, **and the landing Affiliations band (DA-27's fix)** + any future designed-dark band.
- **`.surface-paper`** — pins the LIGHT ramp + `color-scheme: light` (the existing receipt block, renamed and reusable). Users: receipt, any future print/export surface.

Rule: a surface either **flips** (default — channel vars), or is **fixed** (one of these two utilities). No third way; no per-component re-pinning.

### 1.3 The color-role split (ends crimson-does-everything)

Today one red is brand, action, destructive, category and logout (DA-38). DS 2.0 splits color into **five roles**; every colored element must be assignable to exactly one:

| Role | Token family | Values | Flips in dark? |
|---|---|---|---|
| **Brand** | `--c-brand-*` (existing WL ramp) | per-gym; Proline crimson default | No (accent reads on both; `--c-brand-fg` guards contrast) |
| **Action** | `primary-*` = alias of brand (unchanged) | interactive affordances: primary buttons, links, active nav | No |
| **Destructive** | `--c-danger-*` (NEW, fixed) | `#dc2626` ramp, brand-independent | No |
| **Status** | `--c-success/warning/info/neutral-*` (promote the existing HSL vars to channel form) | fixed semantic hues | No (surface tints derive with alpha) |
| **Category** | `--c-cat-1…8` (NEW — DISC-COLOR) | fixed 8-hue categorical palette | No |

**Consequences (the migration story, executed across W1–W3):**

- **Destructive splits from brand.** Logout, Decline, Deactivate, No-show, "Overdue", negative balances → `danger-*`, never `primary-*`. For a crimson-brand gym the hues are near — that is acceptable and mitigated by convention: destructive actions are *never* solid-filled at rest (outline/ghost + icon), get a confirm step, and never sit in persistent chrome (which also resolves DA-18's header logout — it moves into the More sheet/profile).
- **Status is never brand.** Paid/Active = success, Pending = warning, Info = info, Lapsed/muted = neutral. The StatusChip vocabulary (§2.3) is the only consumer.
- **DISC-COLOR (category tokens).** Disciplines get a deterministic color from `--c-cat-1…8` (teal · indigo · amber · emerald · violet · rose · cyan · slate), assigned by stable hash of discipline id, overridable later by a per-discipline column (pairs with the existing per-discipline icon, 000092 — column is a Wave-3 decision, hash is the default and needs no migration). Consumers: schedule/timetable blocks (DA-31's alarm-red grid), portal/coach class category labels (DA-38), discipline chips on landing. Category colors render at **tint strength** (bg `alpha 0.12–0.18`, text at the 700-weight of the hue) so a wall of classes reads calm, not carnival.
- **Red audit:** after migration, `primary-*` red remains only on: primary CTAs, links, active-nav accents, and the brand chrome — i.e. places where a teal-brand gym correctly shows teal today.

### 1.4 Housekeeping the audit ordered

Dead tokens/classes deleted in Wave 1: the undefined `rtl` class the shells apply; the unused `.skeleton` CSS class; the raw-hex `roleBadgeColors`/`SHELL_STYLE.bar` maps in NativeHeader (replaced by tokens in §2). The `--radius-*`, `--z-*`, `--transition-*` tokens become the *only* sanctioned values for new code (components stop hardcoding equivalents); mapping: cards `--radius-2xl`, inputs/buttons `--radius-lg`, chips `full`.

---

## §2 The primitive layer

**Adoption rule (binds every W1+ slice):** if a primitive exists for a pattern, new code MUST use it; touched code MUST migrate to it; untouched code migrates in the scheduled adoption slice. A slice that needs a variant extends the primitive (with spec amendment), never forks it.

**Testid-stability doctrine:** every primitive accepts and passes through `data-testid`. Adoption slices preserve every existing `data-testid` name and semantic — the e2e suite is the regression net for the whole program and must not need rewrites to pass. A primitive that changes DOM structure keeps the testid on the element with the same *role* (the clickable thing stays the clickable thing).

**A11y baseline (all primitives):** visible `focus-visible` ring (token `--ring`), 44×44pt minimum touch targets on mobile, WCAG AA contrast in both themes, correct ARIA per pattern (below), all text via i18n keys.

### 2.1 PageHeader

One header primitive for every routed page, replacing the 31 hand-rolled h1s and the two-convention split (DA-29), and carrying the back affordance (DA-8).

```
<PageHeader
  titleKey="nav.members"        // ONE title source per page — mobile large-title AND desktop h1
  subtitleKey?  actions?        // actions: right-aligned slot (start-aligned in RTL automatically)
  backHref?                     // ← REQUIRED on detail routes (member-360, invoice, class, camp)
  variant? = "large" | "compact"
/>
```

Contract: renders exactly **one `<h1>` in the DOM per breakpoint** (fixes DA-60's double-h1 — the non-active breakpoint's title is not merely CSS-hidden, it is not rendered; the collapsed sticky title is a `<p aria-hidden>` echo). Desktop = `text-h2`-scale title + subtitle + actions row; mobile = the native large-title pattern (collapse-on-scroll stays). Back button: chevron auto-flips in RTL, 44pt target, `aria-label` from `common.back`. Title keys live in ONE map (kills TITLE_KEYS drift and the "Students"/"Members"/"My Students" split — one term per surface decided at adoption: **"Members"** wins everywhere, per the nav).
The slimmed mobile chrome (single badge row — see reference sheet) is part of this primitive: shell badge OR role badge, not both (DA-17: COACH + "● Coach" die; one `ShellBadge` shows "Coach · Sami" style identity), and the persistent logout icon leaves the header (§1.3).

### 2.2 TabBar (shared; the owner's footer-menu primitive)

One bottom-tab primitive for all three shells (today: three copies of NativeTabBar behavior + config drift).

Contract:
- **Capacity: ≤5 items including More.** Configs with >5 fail a build-time assert. (§3 sets each shell's five.)
- **More = a sheet** (staff's existing pattern promoted): overflow destinations + language switcher + theme toggle + sign-out (destructive-styled, confirm).
- **ARIA: it is navigation, not tabs** — `<nav aria-label>` + links with `aria-current="page"`; the `role="tablist"/"tab"` + dangling `aria-controls` pattern is removed (DA-60).
- **Ergonomics:** min 44pt targets; labels `text-[11px]`+ (up from 10px), `truncate` **forbidden on labels** — if a locale's label doesn't fit, the label is wrong (i18n keys get short variants: `nav.short.*`); active state = color + a 4px top indicator bar (not color-only — DA-45); badge slot (inbox count etc.).
- **Surface:** opaque token background (`bg-white` at ≥0.92 with blur, token-backed → flips correctly) — ends content bleed-through (DA-23).
- **Safe-area:** `pb-[env(safe-area-inset-bottom)]` retained — and *live*, because Wave 0 ships `viewportFit: 'cover'` (DA-2).
- Desktop: the md+ rail remains part of this primitive (see §4 for its layering fix).

### 2.3 StatusChip — one pill vocabulary

One chip primitive + one **status vocabulary module** (`src/lib/status-vocabulary.ts`) mapping every domain status to `{variant, i18nKey}`:

- Variants: `success · warning · danger · info · neutral · brand · category(n)`. Sizes `sm | md`. Shape: pill, tint background (`alpha 0.15`) + 700-weight text of the role hue; never solid.
- The vocabulary is the **only** place a domain status picks a color. Invoice statuses: `paid→success`, **`partial→warning` ("Partially paid" — new entry that kills the Paid-above-balance contradiction class, DA-11b)**, `pending→neutral`, `overdue→danger`, `void→neutral-strikethrough`. Member: `active→success`, `expiring→warning`, `lapsed→neutral` (calm, not alarm), `owing→danger`. Belts: label via `enumLabel` (§2.7) + the belt's own color swatch (never a StatusChip).
- One status, one chip, one place per card (kills the duplicated "Active" pill, DA-32); "Settled"-style bare green text is banned — statuses are chips.

### 2.4 EmptyState + the zero doctrine

`<EmptyState icon titleKey hintKey? cta? tone="calm">` (promote `PortalEmpty`; Notifications' design is the visual benchmark). The **doctrine** (binds all shells + landing):

1. **Zeros are calm.** A $0 / count-0 state renders neutral — never warning amber, never a live CTA to process nothing (DA-33). CTAs appear when count > 0.
2. **Summaries must agree with their page.** A roll-up line ("Inbox zero") must derive from the *same query set* as the sections below it — if any section shows actionable items, the summary may not claim zero (DA-6's class, specified so it can't recur).
3. **Public surfaces collapse, never placeholder.** On the landing, an empty section renders nothing — no "coming soon" walls, no interpolated zeros in marketing copy (DA-13/14 class). Dashboard surfaces show EmptyState; public surfaces show absence.
4. Zero-count filter chips are not rendered (DA-49).

### 2.5 Dialog

One modal primitive: **radix `Dialog` rendered through the existing `ModalPortal`** (escapes the PageTransition `position:fixed` trap the codebase already documents; radix supplies focus trap, `Esc`, `aria-labelledby/describedby`, scroll lock). Variants: `center` (desktop default) and `sheet` (mobile bottom-sheet, subsuming SwipeableSheet's role for content dialogs — SwipeableSheet remains only as the More-sheet/gesture surface and gets portaled). The 17 hand-rolled `fixed inset-0` overlays migrate in W1 adoption; new overlays without Dialog fail review.

### 2.6 select→chip completion policy

The J3 select→chip migration completes (DA-33): **interactive filters and pickers with ≤ ~8 options = chips** (roster belts, schedule filters — and filters apply on tap, no separate "Apply" button); **longer lists = a searchable list in a Dialog** (attendance class picker); **native `<select>` survives only inside dense staff data-entry forms**, always via the styled `ui/select` wrapper (which finally gets adopted — audit found it imported once), never bare. Native date inputs: replaced where they render in member/coach surfaces (chips/quick-ranges + Dialog calendar); staff reports may keep native inputs behind a styled wrapper until W3. This policy also closes the dark-mode white-input leaks (DA-25) and the LTR-inside-RTL native controls (DA-33).

### 2.7 fmt — the formatting + bidi module

`src/lib/fmt/` — the ONLY sanctioned path for user-facing values (DA-7/34 class):

- `fmtDate(d, locale, style: 'short'|'medium'|'weekday')` — Intl-based; **one style per context** (lists=short, detail=medium); never raw ISO, never `toLocaleString` dumps.
- `fmtTime(d|hhmm, locale)` / `fmtTimeRange(a, b, locale)` — **24-hour product-wide** (matches the existing schedule and Lebanese convention); range arrow via direction-aware glyph; the *range as a unit* is bidi-isolated so "20:00–21:30" never reverses in Arabic.
- `fmtMoney` — wraps the existing `orderedMoney`/`dualMoney` (their contracts unchanged) adding bidi isolation; symbol side per currency is fixed (`$` leads, `LBP` trails) in BOTH directions.
- `fmtPhone(e164)` — `+961 71 200 015` grouping, always LTR-isolated (kills the trailing-`+`).
- `enumLabel(domain, value, locale)` — belts, roles, methods, statuses via i18n maps; a raw enum reaching the DOM ("black_1") becomes lint-visible because only `enumLabel` may render enums.
- **Bidi rule:** every function returns strings wrapped in Unicode isolates (FSI/PDI) — or the JSX helpers `<Ltr>`/`<Bdi>` for composed nodes. Mixed-direction values (dates, times, phones, money, codes, Latin names) are ALWAYS isolated in RTL context.
- **Missing-key CI gate:** next-intl `onError` throws in CI/e2e builds (a MISSING_MESSAGE fails the run — DA-5 becomes impossible to ship), plus a vitest sweep asserting en/ar/fr key-set parity.

---

## §3 Tab-bar IA per shell — ⚠ OWNER DECISION №1

Staff proved the pattern: **4 primary + More**. Portal (7 flat) and coach (6 flat) exceed capacity and truncate Arabic at 390 (DA-3). Proposed IA (visualized in the reference artifact — approve/adjust per shell):

### Portal 7 → 5: `Home · Classes · Progress · Billing · More`

- **Classes = catalog + weekly schedule merged** (segmented control inside: *Schedule | Browse*). Rationale: both answer "when/what can I train"; the current split forces one question across two tabs, and the schedule tab is a static SUN–SAT list anyway (DA-50 fixes ride this merge: today-highlight, own-classes-first).
- **PT folds into More** — a minority of members hold PT packs; those who do ALSO get a PT card on Home (state-aware: next session / sessions left), so for PT clients it is *closer* than today (one tap, above the fold) while non-PT members stop paying a nav slot for it. More badge-dots when a PT session is pending.
- **Profile folds into More** (low frequency; More also takes freeze request, language, theme, install, sign-out).
- Home keeps: status header, next-class, balance, belt path (§reference), family switcher for guardians.

### Coach 6 → 5: `Today · Attendance · Students · PT · More`

- **Today** (renamed from the ambiguous "Schedule"): the coach's day — classes, next session, quick attendance entry.
- **Trials fold into More** — episodic, not daily; More shows a count badge when trials are scheduled today, and Today surfaces a "trial today" card when one exists (again: closer than a cold tab for the day it matters).
- **Attendance, Students, PT stay primary** — the coach's daily working set (attendance is the floor tool; do not bury it).
- Alternative considered and rejected: merging Attendance into Today — rejected because attendance is used mid-class hands-on; it earns a persistent thumb position.

### Staff: unchanged (4 + More) — already correct; it just migrates onto the shared TabBar primitive.

Approval granularity: the owner can accept portal and coach independently; a different fold (e.g. keep PT primary, fold Billing) is a one-line config change on the same primitive — the *primitive contract* (≤5, More-sheet, short-label keys) is the binding part.

---

## §4 Desktop strategy for portal/coach — ⚠ OWNER DECISION №2

**Recommendation: the App Frame — an explicitly designed, centered mobile-format frame — not first-class desktop layouts.**

Why (argued once, here): portal and coach are companion apps for phone-first users (members in Lebanon; coaches on the mat). The audit's desktop findings (DA-4 header-under-rail, DA-44 column-in-a-void) are symptoms of a *half* state — mobile shell + desktop rail glued together. First-class desktop for these shells is a Wave-worth of layout work per shell with the lowest usage-per-effort in the program; the staff shell — where desktop hours actually accrue — already has real desktop. The honest, excellent, affordable answer is a deliberate frame:

**App Frame contract (≥ md):**
- Content renders in a centered column, `max-width: 480px`, full-height, on a `--c-muted` page ground with an elevation-1 edge — it reads as a designed app canvas, not a stretched phone (the reference shows it).
- **The rail is the frame's nav**, not the page's: fixed inline-start of the *frame region*, `inset-inline-start` positioning ONLY (logical properties; the `isRTL ? 'md:me-20' : 'md:ms-20'` ternaries and every physical side die — DA-4's class).
- **Layering law:** chrome stacks, never overlaps — the header lives *inside* the frame (it can never render under the rail); rail `z-40`, header sticky `z-30` within the frame; one shared `--rail-width` token consumed by both rail and frame margin.
- The frame header carries tenant identity (gym name + logo — DA-40) alongside the shell badge.
- Escape hatch: a specific surface may graduate to a wide layout (e.g. billing tables) by explicit spec amendment; the default is the frame.

Rejected alternative (recorded for the decision): first-class desktop for portal/coach — revisit post-V1 if analytics show meaningful desktop portal usage.

**WL-CHROME boundary: unchanged, no owner decision needed.** Role hues (portal bronze, coach graphite, staff brand-follow) remain the shell identity; the brand ramp remains the action color everywhere (PORTAL-BRAND already fixed the member-side brand read). Nothing in this spec re-tints chrome.

---

## §5 PWA identity spec (DA-15/16 class)

**Manifest (per-tenant AND per-locale):**
- `start_url: '/{locale}'` — the installing user's current locale (the manifest route already varies by host; add locale from the requesting page's path or a `?locale=` on the manifest link). An Arabic owner's installed app opens in Arabic (the OFF-PERF stranding class dies at the root).
- `lang`/`dir` from that locale; `description` from the gym's own tagline (i18n), never "PRO LINE Gym Management Platform".
- `background_color` (splash) = the *theme-appropriate* app ground: `#ffffff` default; a dark-theme user's install gets `#131317` (splash follows the stored theme at install time; acceptable approximation, documented).
- Icons: tenant logo processed at upload into real 192/512 **maskable** squares (padded canvas, brand-color matte) — the sizes stop lying; default gyms keep the shipped icon set. Legacy `public/manifest.json` is deleted (the dynamic route is the only manifest).
- **Apple layer:** `apple-touch-icon` link (180×180 from the same processed set) + `appleWebApp` metadata (`capable`, `statusBarStyle: 'black-translucent'`, per-gym `title`) in the locale layout.
- **theme-color follows the app, not the OS:** ThemeToggle (and the boot script) set `<meta name="theme-color">` to match `html.dark` state; the static media-query pair is replaced (DA-62). Chrome inherits per-gym brand for light, `#131317` for dark (as today's values, correctly switched).

**Install card (role/tenant/device/language-aware):** identity = the *user's* gym (name+logo — never the host default's monogram); copy per role (member: "your gym in your pocket — schedule, progress, billing"; coach: "your day at a glance"; staff: keeps the front-desk pitch); instructions per platform (iOS Safari: Share→Add to Home Screen; Android/Chrome: install icon; desktop: address-bar icon) detected by UA; fully translated (the blank-name string is Wave 0). **Placement: demoted below the page's primary content** — first-card position belongs to the user's own status (DA-15). Dismissal persists per device.

**offline.html: tenant-neutral** — neutral dark ground + the *cached* gym name when known (localStorage stamp written by the shell), monogram-tile fallback, no Proline crimson hardcode, `lang`/`dir` from the cached locale (DA-59).

---

## §6 Dark-mode contract & the byte-identity principle

1. **Mechanism (binds always):** dark = the `html.dark` channel-var inversion. Components never implement dark; they use tokens. New `dark:` variants remain banned (§1.1); designed-fixed surfaces use §1.2 utilities; native controls get `color-scheme` (already global).
2. **Light byte-identity (binds Wave 1):** W1 primitive-adoption slices must leave light-mode rendering byte-identical except where a cited DA finding *is* the change (e.g. removing a duplicate status pill cites DA-32). The proof is the Phase-1 capture harness re-run: light-mode shots diff clean, finding-cited diffs enumerated in the slice report.
3. **Deliberate supersession (Waves 2–3):** redesigned surfaces (new tab bars, App Frame, portal home hierarchy) intentionally change light pixels. There, the *approval artifact + fresh screenshot matrix* replace byte-identity as the acceptance evidence — each W2/W3 slice ships the before/after matrix ({en,ar}×{light,dark}×{390,1280}) in its report.
4. **Dark parity gate (Wave 4):** the certification pass re-runs the full audit matrix; a finding-class regression (light-pinned tint, ghost text, inverted active state) blocks merge. The harness is the standing rig; its metrics (`darkApplied`, contrast spot-checks) are the evidence.

---

## Appendix A — wave mapping (which section authorizes which slice)

| Wave | Slice (indicative) | Authority |
|---|---|---|
| W0 *(Lane B, in flight)* | mechanical DA fixes | Phase-1 register directly (not this spec) |
| **W1** | `DS2-TOKENS`: color roles, `--c-danger/cat/whatsapp`, fixed-surface utilities, dead-token deletions | §1.2, §1.3, §1.4 |
| **W1** | `DS2-FMT`: fmt module + bidi isolates + missing-key CI gate + enumLabel adoption | §2.7 |
| **W1** | `DS2-PRIMITIVES`: PageHeader, TabBar, StatusChip+vocabulary, EmptyState, Dialog | §2.1–2.5 (contracts), §2 adoption+testid doctrine |
| **W1** | `DS2-ADOPT-STAFF` / `-PORTAL` / `-COACH`: mechanical adoption per shell | §2 adoption rule; §6.2 byte-identity + harness proof |
| **W2** | `NAV-IA`: portal 5-tab + coach 5-tab on shared TabBar; header slim | §3 (as owner-approved), §2.1, §2.2 |
| **W2** | `APP-FRAME`: portal/coach desktop frame + rail layering + logical sides | §4 (as owner-approved) |
| **W2** | `PWA-IDENTITY`: manifest per-tenant+locale, Apple layer, theme-color, install card, offline.html | §5 |
| **W2** | first-run audit (welcome/onboarding from a fresh gym) | Phase-1 coverage-gap note + §2 primitives |
| **W3** | shell polish slices (schedule fit, money zero-states, member-360 back+actions, portal home hierarchy + belt visual, coach inputs→chips, auth frame, landing brand adoption + content) | §1.3 (category colors, red audit), §2.4 (zero doctrine), §2.6, §4 escape hatch, reference-sheet screens |
| **W4** | `DS2-CERT`: color-literal lint gate ON, dark/RTL certification, harness as regression rig | §1.1, §6.4 |

**Slice-prompt rule:** every W1–W4 execution prompt cites its Authority cell; a change with no authority is scope creep and stops for a decree.

---

## Appendix B — what the owner is approving (R2 artifact contents)

The pixel reference shows, en + ar: the token sheet (color roles incl. category palette, neutrals in both themes, type ramp), the primitive sheet (buttons incl. the destructive convention, StatusChip vocabulary incl. "Partially paid", EmptyState, Dialog, all three TabBars), and four re-imagined screens @390 — **portal Home (light AND dark), staff Today, coach Today** — wearing: the slimmed one-badge header, the 5-tab bars with indicator + More, calm zero states, category-colored class rows, the belt-path card, demoted install card, and the App Frame vignette. Approval of the artifact = approval of §3 + §4 decisions and the visual direction; the spec text governs everything the pixels can't show.
