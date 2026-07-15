/**
 * PRAXELLA-DOOR R1 — the ONE central host resolver.
 *
 * Resolves an incoming HTTP Host to a landing target, in this precedence:
 *   (i)   exact vendor hosts (praxella.com, www.praxella.com; env-configurable
 *         VENDOR_LANDING_HOSTS) → the VENDOR landing.
 *   (ii)  a mapped custom domain (get_gym_slug_by_domain) — unchanged; handled
 *         by the async orchestrator for `other` hosts.
 *   (iii) <slug>.praxella.com → that gym's landing by subdomain slug; an unknown
 *         or malformed label → a clean redirect to praxella.com (never a 500).
 *   (iv)  anything else (Railway host, localhost dev, a custom domain) → the
 *         DEFAULT gym, exactly as today.
 *
 * `classifyHost` is a PURE function (no I/O) so the full matrix is unit-tested.
 * The custom-domain DB lookup (ii) lives in the async orchestrator; a `other`
 * classification means "try the custom-domain map, else DEFAULT".
 *
 * Per-gym identity rule is preserved: Host only picks the ANON landing. An
 * authenticated user is always branded by their OWN gym (lib/pwa/identity).
 */
import { PLATFORM_BRAND } from '@/lib/brand';

export type HostClass =
  | { kind: 'vendor' }
  | { kind: 'subdomain'; slug: string }
  | { kind: 'subdomain-invalid' }
  | { kind: 'other'; host: string | null };

// A DNS-label-ish gym slug (lowercase alnum + internal hyphens). Mirrors the
// slug shape gyms are seeded with; rejects leading/trailing hyphens + junk.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Lowercase, trim, drop any :port. Returns null for empty/absent. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase().split(':')[0];
  return h || null;
}

/** The platform apex (env override → brand constant). */
export function platformRootDomain(): string {
  return (process.env.PRAXELLA_ROOT_DOMAIN || PLATFORM_BRAND.rootDomain).trim().toLowerCase();
}

/**
 * The exact vendor hosts. VENDOR_LANDING_HOSTS (comma-sep) overrides; the
 * default is the apex + www so praxella.com answers the vendor landing the
 * moment DNS points at it — with no env change required.
 */
export function vendorHosts(): string[] {
  const raw = process.env.VENDOR_LANDING_HOSTS;
  if (raw && raw.trim()) {
    return raw.split(',').map((h) => h.trim().toLowerCase().split(':')[0]).filter(Boolean);
  }
  const root = platformRootDomain();
  return [root, `www.${root}`];
}

/** Where an unknown/malformed *.praxella.com subdomain redirects. */
export function vendorRedirectUrl(): string {
  return `https://${platformRootDomain()}`;
}

/**
 * Classify a Host header (PURE). `forceVendor` is the ?vendor=1 dev preview.
 * `cfg` lets tests pin the vendor-host list + root domain deterministically.
 */
export function classifyHost(
  host: string | null | undefined,
  cfg?: { vendorHosts?: string[]; rootDomain?: string; forceVendor?: boolean },
): HostClass {
  if (cfg?.forceVendor) return { kind: 'vendor' };

  const h = normalizeHost(host);
  if (!h) return { kind: 'other', host: null };

  const root = (cfg?.rootDomain ?? platformRootDomain()).trim().toLowerCase();
  const vh = cfg?.vendorHosts ?? vendorHosts();

  // (i) exact vendor hosts (incl. the bare apex).
  if (h === root || vh.includes(h)) return { kind: 'vendor' };

  // (iii) *.praxella.com → subdomain slug.
  const suffix = `.${root}`;
  if (h.endsWith(suffix)) {
    const label = h.slice(0, h.length - suffix.length);
    if (!label || label.includes('.')) return { kind: 'subdomain-invalid' }; // empty / multi-level
    if (label === 'www') return { kind: 'vendor' };
    if (SLUG_RE.test(label)) return { kind: 'subdomain', slug: label };
    return { kind: 'subdomain-invalid' };
  }

  // (ii)+(iv) custom-domain candidate else DEFAULT — resolved by the orchestrator.
  return { kind: 'other', host: h };
}

/**
 * The gym slug for a NON-vendor request (async — step (ii) hits the DB via the
 * cached get_gym_slug_by_domain). `?gym=` (CI/preview) wins, then the subdomain
 * slug, then a mapped custom domain, else undefined → DEFAULT downstream.
 */
export async function resolveTenantSlug(
  rawHost: string | null | undefined,
  gymParam: string | undefined,
  cls: HostClass,
): Promise<string | undefined> {
  if (gymParam) return gymParam;
  if (cls.kind === 'subdomain') return cls.slug;
  // Lazy import: keeps this module (and its pure classifier) importable in unit
  // tests without evaluating gym.ts's request-scoped React cache() at load time.
  const { getGymSlugByDomain } = await import('@/lib/marketing/gym');
  return (await getGymSlugByDomain(rawHost)) || undefined;
}
