import { SITE_URL } from '@/lib/seo';
import { platformRootDomain, type HostClass } from './resolver';

/**
 * OXY-HOST · R4 — pure canonical/alias/hreflang URL builders. No I/O; the caller
 * supplies the resolved facts (host class, whether the host maps to a gym, and —
 * when a reader exists — the gym's primary custom domain). Kept pure so the SEO
 * URL matrix unit-tests without a request.
 */

function host(h: string | null | undefined): string {
  return (h || '').trim().toLowerCase().split(':')[0];
}

/**
 * The canonical origin (scheme+host, no trailing slash) for a resolved landing
 * request:
 *   · vendor            → https://<praxella root>            (the platform apex)
 *   · gym w/ primary    → https://<primary custom domain>    (when a reader supplies it)
 *   · ?gym= preview     → SITE_URL                           (CI selector, not a real host)
 *   · <slug>.praxella   → https://<that subdomain>           (self — subdomain IS canonical)
 *   · mapped custom dom → https://<that host>                (self)
 *   · DEFAULT / unmapped→ SITE_URL                           (demo/Railway unchanged)
 */
export function canonicalOrigin(
  effHost: string | null,
  cls: HostClass,
  opts?: { mappedByDomain?: boolean; hasGymParam?: boolean; primaryDomain?: string | null },
): string {
  if (cls.kind === 'vendor') return `https://${platformRootDomain()}`;
  const primary = host(opts?.primaryDomain);
  if (primary) return `https://${primary}`;
  if (opts?.hasGymParam) return SITE_URL;
  const h = host(effHost);
  if (cls.kind === 'subdomain' && h) return `https://${h}`;
  if (cls.kind === 'other' && opts?.mappedByDomain && h) return `https://${h}`;
  return SITE_URL;
}

/** Absolute canonical URL for a locale on the canonical origin. */
export function canonicalUrl(origin: string, locale: string): string {
  return `${origin.replace(/\/$/, '')}/${locale}`;
}

/**
 * PWA-BASICS · INVITE-HOST — the canonical origin for a gym identified by SLUG
 * (not by the current request host), for building OUTBOUND links (portal/staff
 * invites, shareable links, WhatsApp messages) that must land on the gym's own
 * home no matter where they are generated (a vendor console, the front desk, …):
 *   1. the gym's PRIMARY custom domain (gym_domains.is_primary) — supplied by the
 *      caller from getGymPrimaryDomain(slug);
 *   2. else its `<slug>.praxella.com` subdomain;
 *   3. else NEXT_PUBLIC_SITE_URL (last resort — no slug / unconfigured).
 * Pure so it unit-tests without a request; the async wrapper gymCanonicalOrigin()
 * (src/lib/host/primary-domain.ts) resolves the primary domain then calls this.
 */
export function gymCanonicalOriginFrom(
  slug: string | null | undefined,
  primaryDomain: string | null | undefined,
): string {
  const primary = host(primaryDomain);
  if (primary) return `https://${primary}`;
  const s = (slug || '').trim().toLowerCase();
  if (s) return `https://${s}.${platformRootDomain()}`;
  return SITE_URL;
}

/**
 * hreflang alternates (absolute) for every locale + x-default (→ the default
 * locale), all on the canonical origin.
 */
export function hreflangAlternates(
  origin: string,
  locales: readonly string[],
  defaultLocale: string,
): Record<string, string> {
  const base = origin.replace(/\/$/, '');
  const out: Record<string, string> = {};
  for (const l of locales) out[l] = `${base}/${l}`;
  out['x-default'] = `${base}/${defaultLocale}`;
  return out;
}

/**
 * The 301 target when the request arrives on a NON-primary alias (its subdomain
 * or a secondary custom domain) of a gym that HAS a primary custom domain — the
 * primary host, with the path (locale + query) preserved. Returns null when no
 * primary domain is known (→ no redirect: gyms without a custom domain, and the
 * whole app until a primary-domain reader exists, are byte-identical).
 */
export function aliasRedirectTarget(
  effHost: string | null,
  primaryDomain: string | null | undefined,
  pathWithQuery: string,
): string | null {
  const primary = host(primaryDomain);
  if (!primary) return null;
  const h = host(effHost);
  if (!h || h === primary) return null;
  const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  return `https://${primary}${path}`;
}
