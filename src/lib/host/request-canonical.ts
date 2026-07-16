import { headers } from 'next/headers';
import { effectiveHost } from './effective-host';
import { classifyHost, resolveTenantSlug } from './resolver';
import { canonicalOrigin } from './canonical';
import { getGymPrimaryDomain } from './primary-domain';

/**
 * OXY-HOST · R4 — the canonical origin for the CURRENT request host, resolved
 * server-side (reads headers + the domain map). Used by the per-host robots.txt
 * and sitemap.xml so each host advertises ITS canonical URLs:
 *   · vendor host        → https://<praxella root>   (the vendor pages)
 *   · <slug>.praxella    → that subdomain
 *   · mapped custom dom  → that domain (or its primary, when a reader supplies it)
 *   · DEFAULT / unmapped → SITE_URL                  (Railway/demo unchanged)
 * Reading headers() opts these routes into per-request (dynamic) rendering.
 */
export async function requestCanonicalOrigin(): Promise<string> {
  const h = effectiveHost(headers());
  const cls = classifyHost(h);
  if (cls.kind === 'vendor') return canonicalOrigin(h, cls);
  const slug = await resolveTenantSlug(h, undefined, cls);
  const primaryDomain = await getGymPrimaryDomain(slug);
  return canonicalOrigin(h, cls, {
    mappedByDomain: cls.kind === 'other' && !!slug,
    primaryDomain,
  });
}
