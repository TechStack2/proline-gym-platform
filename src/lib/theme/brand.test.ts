import { describe, it, expect } from 'vitest'
import { buildBrandChannelsCss } from './brand'

/**
 * WL-THEME — the brand-ramp derivation. Proves: NULL/invalid → '' (Proline defaults
 * apply, byte-identical); a valid hex → a `:root{--c-brand-*}` block whose 700 channel
 * is the exact brand RGB and whose foreground flips by luminance (white on dark brands,
 * near-black on light) so brand-on-brand text stays legible.
 */
describe('WL-THEME · buildBrandChannelsCss', () => {
  it('returns empty for null / undefined / invalid → globals defaults (byte-identical)', () => {
    expect(buildBrandChannelsCss(null)).toBe('')
    expect(buildBrandChannelsCss(undefined)).toBe('')
    expect(buildBrandChannelsCss('')).toBe('')
    expect(buildBrandChannelsCss('red')).toBe('')
    expect(buildBrandChannelsCss('#abc')).toBe('') // must be 6-digit hex
    expect(buildBrandChannelsCss('#12345g')).toBe('')
  })

  it('anchors --c-brand-700 at the exact brand RGB', () => {
    const css = buildBrandChannelsCss('#1d4ed8') // 29 78 216
    expect(css.startsWith(':root{')).toBe(true)
    expect(css).toContain('--c-brand-700:29 78 216')
    // Proline crimson round-trips to its exact channels too.
    expect(buildBrandChannelsCss('#cd1419')).toContain('--c-brand-700:205 20 25')
  })

  it('white foreground on a dark brand, near-black on a light brand', () => {
    expect(buildBrandChannelsCss('#1d4ed8')).toContain('--c-brand-fg:255 255 255') // dark blue
    expect(buildBrandChannelsCss('#facc15')).toContain('--c-brand-fg:26 26 26') // light yellow
  })

  it('emits the full 12-var ramp with lighter tints and darker shades', () => {
    const css = buildBrandChannelsCss('#1d4ed8')
    for (const k of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', 'fg']) {
      expect(css).toContain(`--c-brand-${k}:`)
    }
    // 50 (near-white tint) is much lighter than 900 (dark shade) — channel sums ordered.
    const sum = (v: string) => v.split(' ').reduce((a, b) => a + Number(b), 0)
    const grab = (k: string) => sum(css.match(new RegExp(`--c-brand-${k}:([0-9 ]+)`))![1].trim())
    expect(grab('50')).toBeGreaterThan(grab('700'))
    expect(grab('700')).toBeGreaterThan(grab('900'))
  })
})
