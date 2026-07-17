/**
 * OXY-HOST · R4 — a gym's PRIMARY custom domain (gym_domains.is_primary) or null.
 *
 * gym_domains is RLS-locked (000073); the anon-safe reader is the definer RPC
 * `get_gym_primary_domain(p_slug)` (migration 000102, folded in from PROXY-HOST
 * per docs/runbooks/custom-domain.md §5) → returns gym_domains.domain WHERE
 * is_primary, else null. With it wired, `canonicalOrigin` + `aliasRedirectTarget`
 * (src/lib/host/canonical.ts) now (a) canonicalize a gym's *.praxella.com
 * subdomain to its custom domain and (b) 301 any non-primary alias → the primary.
 *
 * A gym WITHOUT a primary custom domain still returns null → it self-canonicalizes
 * on its arrival host and no alias 301 fires (byte-identical to pre-OXY-HOST).
 */
import { createClient } from '@/lib/supabase/server';

export async function getGymPrimaryDomain(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_gym_primary_domain', { p_slug: slug });
  return (data as string | null) || null;
}
