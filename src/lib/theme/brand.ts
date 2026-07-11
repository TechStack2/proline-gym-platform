/**
 * WL-THEME — derive the app BRAND ramp (the `--c-brand-*` channel vars the Tailwind
 * `primary-*` utilities read) from a single `gyms.brand_color`. Emitted as a nonce'd
 * `:root{…}` block in the authed shells (BrandThemeStyle), so every primary accent —
 * buttons, active nav, links, focus ring — follows the gym's colour.
 *
 * NULL / invalid brand_color → '' (no override): the globals.css DEFAULTS apply, which
 * are the EXACT former Proline hexes, so an unbranded gym is byte-identical.
 *
 * WL-CHROME: the same block also re-points the STAFF shell chrome (.shell-staff --surface
 * → the top-accent stripe, active nav item, and role badge) at the brand, so the header
 * finally matches the product. Only .shell-staff — portal-bronze / coach-graphite are role
 * hues, not Proline-brand, and stay put. Emitted only when a brand is set, so Proline/unset
 * keeps the globals crimson (#cd1419 light / #e5484d dark) untouched.
 *
 * The ramp is anchored at 700 = brand_color (where the crimson sat): lighter steps mix
 * toward white (tints), darker steps toward black (shades) — a coherent, self-consistent
 * scale for any hue. Channels are "R G B" (space-separated) to feed rgb(var(--x)/alpha).
 * `--c-brand-fg` (text ON brand) is chosen by perceived luminance so brand-on-brand text
 * stays legible for light brand colours and in dark mode (brand bg is unchanged on dark).
 * Pure string math (no color-mix/CSS deps) → identical on server + client, CSP-safe.
 */
const HEX6 = /^#[0-9a-fA-F]{6}$/

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
const chan = (rgb: number[]) => rgb.map(clamp).join(' ')
/** mix toward black (f<1 darker). */
const shade = (rgb: number[], f: number) => rgb.map((x) => x * f)
/** mix toward white (f = fraction of the way to 255). */
const tint = (rgb: number[], f: number) => rgb.map((x) => x + (255 - x) * f)

export function buildBrandChannelsCss(brandColor?: string | null): string {
  if (!brandColor || !HEX6.test(brandColor)) return ''
  const base = toRgb(brandColor)
  // Perceived luminance (0–255): white text on a dark brand, near-black on a light one.
  const lum = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]
  const fg = lum > 150 ? '26 26 26' : '255 255 255'
  const vars: Record<string, string> = {
    '--c-brand-50': chan(tint(base, 0.95)),
    '--c-brand-100': chan(tint(base, 0.88)),
    '--c-brand-200': chan(tint(base, 0.76)),
    '--c-brand-300': chan(tint(base, 0.6)),
    '--c-brand-400': chan(tint(base, 0.42)),
    '--c-brand-500': chan(tint(base, 0.24)),
    '--c-brand-600': chan(tint(base, 0.1)),
    '--c-brand-700': chan(base),
    '--c-brand-800': chan(shade(base, 0.82)),
    '--c-brand-900': chan(shade(base, 0.62)),
    '--c-brand-950': chan(shade(base, 0.4)),
    '--c-brand-fg': fg,
  }
  const root = `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`
  // The staff role surface follows the brand on BOTH themes. Brand isn't flipped on dark
  // (like every primary-* accent), so the dark rule pins the brand too — it must match the
  // higher-specificity globals `html.dark .shell-staff` rule and win on source order.
  const staff = `.shell-staff{--surface:rgb(var(--c-brand-700))}html.dark .shell-staff{--surface:rgb(var(--c-brand-700))}`
  return root + staff
}
