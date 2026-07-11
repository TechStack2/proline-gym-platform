import { headers } from 'next/headers'
import { buildBrandChannelsCss } from '@/lib/theme/brand'

/**
 * WL-THEME — inject the authed gym's brand ramp into the app shell. Renders a
 * NONCE'D `:root{--c-brand-*}` <style> (prod style-src is nonce + strict-dynamic with
 * NO 'unsafe-inline', so a style="" attr would be STRIPPED — the same CSP-safe path the
 * landing uses for --brand). brandColor is the USER'S gym colour (never the Host's), so
 * a member of a branded gym sees their brand on every shell. NULL/invalid → nothing
 * rendered → the globals.css Proline defaults apply (byte-identical).
 */
export function BrandThemeStyle({ brandColor }: { brandColor?: string | null }) {
  const css = buildBrandChannelsCss(brandColor)
  if (!css) return null
  const nonce = headers().get('X-CSP-Nonce') ?? ''
  return <style nonce={nonce} data-testid="brand-theme" dangerouslySetInnerHTML={{ __html: css }} />
}
