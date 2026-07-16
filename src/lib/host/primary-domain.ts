/**
 * OXY-HOST · R4 — a gym's PRIMARY custom domain (gym_domains.is_primary) or null.
 *
 * gym_domains is RLS-locked (000073) and the only anon-safe RPC,
 * get_gym_slug_by_domain, is one-directional (domain→slug) and does not expose
 * is_primary. So there is NO anon-safe path to a gym's primary domain yet.
 *
 * Enabling primary-domain canonicalization + the alias→primary 301 needs ONE
 * anon-safe reader — a definer RPC `get_gym_primary_domain(p_slug)` returning
 * gym_domains.domain WHERE is_primary (SQL in docs/runbooks/custom-domain.md).
 * That is a MIGRATION, which is out of scope for this slice (STOP for migration
 * needs). Until the auditor applies it, this returns null →
 *   · every gym self-canonicalizes on its arrival host (custom domain → itself,
 *     subdomain → itself), and
 *   · NO alias 301 fires — gyms without a custom domain are byte-identical.
 *
 * To activate (2-line change, no other code touched): apply the RPC + regenerate
 * types, then return
 *   (await (await createClient()).rpc('get_gym_primary_domain', { p_slug: slug })).data || null
 */
export async function getGymPrimaryDomain(_slug: string | null | undefined): Promise<string | null> {
  return null;
}
