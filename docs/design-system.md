# PRO LINE Platform — Mini Design System (AX-1)

> One page. Every rule here is one the codebase actually follows — utilities exist in `tailwind.config.ts` / `globals.css`. Later slices style against THIS, not against vibes.

## Type scale (both scripts)
Arabic = **IBM Plex Sans Arabic** (`--font-arabic`, via next/font, weights 400/500/700, swap + size-adjusted fallback). Latin = **Inter** (`--font-latin`). Arabic runs ~4% taller per glyph: keep the same rem sizes — never bump sizes for ar; use `font-arabic` only where mixed-content needs forcing (html[lang=ar] already sets it globally).

| Role | Class | Size/leading | Weight |
|---|---|---|---|
| Display (landing hero) | `text-4xl…text-display-lg` | 36–48/1.1 | 700 |
| Page title | `text-2xl` | 24/1.3 | 700 |
| Section/card title | `text-base`–`text-lg` | 16–18/1.4 | 600–700 |
| Body | `text-sm` | 14/1.5 | 400–500 |
| Caption/meta | `text-xs` | 12/1.4 | 400–500 |
| Micro (chips, tallies) | `text-2xs` | 10/1 | 500 |

## Spacing rhythm — 4px grid
Card padding `p-4` (16) mobile / `p-6` (24) desktop-wide. Stack gaps `space-y-2` inside groups, `space-y-4` between cards, `space-y-6` between page regions. Chip rows `gap-1.5` (6), icon-to-label `gap-2` (8). Landing sections `py-20 lg:py-28`. Never invent off-grid values.

## Card anatomy
`rounded-2xl bg-white shadow-sm` (+`border border-gray-100` when on white). Header: title (`text-sm font-semibold text-gray-900`) + optional right-aligned meta/badge, `mb-2/3`. Body rows `text-sm text-gray-700`, labels `text-gray-500`. Inner sub-cards step DOWN: `rounded-xl bg-gray-50 p-3`. Hover (actionable cards only): `hover:shadow-elevation-2 transition-all`.

## Color tokens
- **Brand:** red `#cd1419` (primary-600; hover `#a81014`), black `secondary-900`, white. Red is for primary actions + brand accents — never body text.
- **Semantic:** green=paid/active, amber=expiring/warning, red=overdue/danger, blue=info/frozen, gray=archived. Always the `-50` bg + `-700` text pairing (`bg-green-50 text-green-700`).
- **Per-shell accents** (per-ROLE platform tokens, layered over gym branding — tenant-clean):
  | Shell | Token (`--shell-accent`) | Badge | PWA theme-color |
  |---|---|---|---|
  | Staff/dashboard | `#cd1419` brand red | STAFF | `#cd1419` |
  | Coach | `#d4af37` gold on black | COACH | `#111111` |
  | Member portal | `#0e7490` cool teal | MEMBER | `#0e7490` |
  Applied to: header badge chip, header accent bar, active-nav states. The accent never replaces brand red on primary CTAs.

## Empty-state pattern
Icon (`h-10 w-10 text-gray-300`) → one-liner (`text-sm text-gray-400`) → optional ONE action button. Centered, `py-8/12`, inside the normal card chrome. No paragraphs, no illustrations.

## Button hierarchy
1. **Primary** (one per view): `bg-[#cd1419] hover:bg-[#a81014] text-white rounded-xl font-semibold`.
2. **Secondary:** `variant="outline"` gray border, dark text.
3. **Tertiary/ghost:** icon-button or text link; destructive ghosts get `text-red-500 hover:bg-red-50`.
Sizes: `size="sm"` inside cards, default in page headers. Never two primaries side-by-side.

## RTL
Logical properties / paired utilities (`ms-/me-`, `rtl:` variants) over manual flips; chevrons flip via `rtl:rotate-180` (or the `icon-rtl-flip` helper); phone numbers and times always `dir="ltr"`. Dates/numerals: **Western digits, localized month/day names** — `dateLocale(locale)` from `src/lib/utils/locale-format.ts` (`ar-LB-u-nu-latn` / `fr-FR` / `en-US`). Never raw `'ar-LB'`.
