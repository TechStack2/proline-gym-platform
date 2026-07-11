---
name: rtl-arabic-design
description: >
  The rulebook for getting Arabic and RTL right in Dabbira. USE THIS whenever the
  work touches Arabic text, RTL/LTR layout, bidirectional (mixed Arabic+Latin)
  content, numerals, icon mirroring, or Arabic typography (font, size, line-height,
  weight) — even if the request only mentions "the layout looks off in Arabic" or
  "the font." Arabic is the canonical product here, so this applies to most UI work,
  not just explicitly "Arabic" tasks. Produces RTL/Arabic specs and the per-script
  type scale, and validates designs against the checklist at the end.
---

# RTL & Arabic Design for Dabbira

Arabic is Dabbira's primary language and its hardest-to-win users (providers) are
Arabic-dominant. Design and write **Arabic first**; English/French are derived.
RTL is not "flip the English layout" — it is the canonical layout, with LTR as the
variant.

## 1. Arabic typography (the #1 pilot complaint)

Users said the Arabic is "too small," hard to "decipher," and the font "isn't fun."
Arabic needs more optical size and air than Latin because of contextual letter
shaping, dots, and denser counters. Specify a **per-script type scale**:

- **Size:** Arabic base ≈ **1.1–1.2×** the Latin base. If Latin body is 16px,
  Arabic body ≈ 18px. On mobile especially, scale up — Arabic gets dense on small
  screens.
- **Line-height:** Arabic body **≥1.5, ideally ~1.6–1.8**. Looser than Latin.
- **Weight:** use **medium** for Arabic body, not light/thin — thin reads as faint
  and "small."
- **Letter-spacing:** **never** apply tracking/letter-spacing to Arabic — it breaks
  the connected (cursive) letterforms. Use size + line-height + weight for legibility.
- **Hierarchy:** establish a clear scale (display / h1 / h2 / body / caption) with
  weight and size, not color alone. "Headers are confusing" = weak hierarchy.
- **No text baked into images** — it can't be flipped, resized, or translated.
- Expect Arabic strings to be **~25% longer/shorter** than English; layouts must
  flex.

**Font choice ("not fun"):** the current Tajawal/Cairo read cool/corporate. Shortlist
2–3 warmer, highly legible Arabic faces and **A/B them with the providers** (the
critics) — candidates to consider: Readex Pro, Rubik, IBM Plex Sans Arabic, Alexandria,
Vazirmatn, Noto Sans/Kufi Arabic; a rounded face (e.g. Baloo Bhaijaan 2) for headings
only if it tests well. Prefer a superfamily that covers Arabic + Latin so scripts feel
unified, or a deliberately paired Latin face. Confirm the final face by testing, not by
preference. Put the per-script tokens in the `design-system-tokens` output.

## 2. Layout & mirroring

- The whole UI mirrors: reading flows top-**right**, primary navigation anchors on
  the **right**, back/forward and progress run right-to-left.
- **Author in logical properties**, not physical ones: `ps`/`pe`, `ms`/`me`,
  `start`/`end`, `inset-inline-start/end`, `text-align: start/end`. This makes RTL
  automatic and lets the coding agent **retire the `[dir="rtl"]` override block** in
  `globals.css` incrementally. Flag any physical utility you see as tech debt to migrate.
- Do **not** mirror everything: keep logos, media play/pause/volume controls, and
  number pads in their standard orientation.

## 3. Bidirectional (mixed) content

Real Dabbira content mixes Arabic with Latin (brand names, product codes, prices,
phone numbers, URLs).

- **Numbers always render left-to-right**, even inside Arabic. The Unicode bidi
  algorithm handles most of it.
- For embedded LTR runs that misalign (phone numbers, codes), isolate them:
  `direction: ltr; unicode-bidi: isolate;` or wrap in `<bdi>`. Specify this per field.
- **Numerals policy: Western (0-9)** in the Arabic UI (standard in Lebanon). Do not
  mix Western and Eastern Arabic numerals.

## 4. Icon direction

- **Flip** directional icons: chevrons/arrows, back/next, "read more," progress
  carets, send arrows. (The app already uses `rtl:rotate-180` / `rtl:-scale-x-100`
  in spots — extend this consistently.)
- **Don't flip** non-directional ones: play, logos, checkmarks, brand marks.

## 5. RTL/Arabic pre-ship checklist (run on every screen spec)

- [ ] Designed Arabic-first; en/fr derived, not the reverse.
- [ ] Layout reads right-anchored; nav, progress, and back/forward mirrored.
- [ ] Authored with logical properties (no new physical `ml-`/`pr-`/`left-`).
- [ ] Arabic type uses the per-script scale (≥1.1× size, ≥1.5 line-height, medium
      weight, no letter-spacing).
- [ ] Real Arabic content used in the mockup — never Lorem Ipsum.
- [ ] Numbers and embedded Latin isolated and rendering LTR; Western numerals.
- [ ] Directional icons flip; non-directional icons don't.
- [ ] No text baked into images.
- [ ] Layout holds with Arabic string length (±25%) and at mobile widths.
- [ ] A native Lebanese Arabic reader has reviewed wording and tone
      (see `arabic-first-content`).
