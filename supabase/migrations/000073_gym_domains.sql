-- ============================================================
-- 000073: WL-DOMAIN-ROUTING — custom-domain → gym map (APP side)
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / WL-DOMAIN-ROUTING)
--
-- Lets the app resolve WHICH gym a request is for by its DOMAIN, so e.g.
-- prolinegym.me renders Proline's branded landing (reusing WL-LANDING branding).
-- DNS/SSL/Cloudflare/Railway is SEPARATE infra (owner + auditor) — this migration
-- is just the data + an anon-safe resolver the render layer calls.
--
-- MODEL — a gym_domains map (not a single gyms.custom_domain), so one gym can own
-- apex + www + a subdomain (each a row). `domain` is UNIQUE (a domain maps to at
-- most one gym) and stored lowercased; `is_primary` marks the canonical host for
-- future canonicalization. Absent row = no custom domain → the app falls back to
-- ?gym=slug / DEFAULT_GYM_SLUG (the vendor/Railway domain) — nothing regresses.
--
-- SCOPE: domain drives LANDING + branding ONLY. No auth/RLS coupling — the
-- authenticated app still scopes by the logged-in user's gym (login = tenant).
-- The table is RLS-locked (no anon/authenticated policy); resolution is via a
-- SECURITY DEFINER RPC that returns ONLY the slug of an ACTIVE gym.
-- ============================================================

CREATE TABLE IF NOT EXISTS gym_domains (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL UNIQUE,            -- lowercased host, no port (e.g. 'prolinegym.me')
  is_primary BOOLEAN NOT NULL DEFAULT false,  -- the canonical host (for future canonicalization)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gym_domains_gym ON gym_domains (gym_id);

-- RLS: locked down. No anon/authenticated policy — the table is never read
-- directly by the client. Resolution goes through the definer RPC below (returns
-- only a slug); service_role (server/e2e seed) bypasses RLS. This keeps the
-- domain→gym map out of the public surface while the landing can still resolve it.
ALTER TABLE gym_domains ENABLE ROW LEVEL SECURITY;

-- Resolver: domain (any case) → the ACTIVE gym's slug, or NULL if unmapped. Anon-
-- safe (returns only the slug — same public-catalog visibility contract as
-- get_public_gym / 000035). Callable by the landing (anon) + the login shell.
CREATE OR REPLACE FUNCTION get_gym_slug_by_domain(p_domain TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.slug::TEXT
  FROM gym_domains d
  JOIN gyms g ON g.id = d.gym_id
  WHERE d.domain = lower(p_domain) AND g.is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION get_gym_slug_by_domain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_gym_slug_by_domain(TEXT) TO anon, authenticated;
