# The certification rig — standing capture + gate harness

**Entrypoint:** `scripts/design-audit/certify.mjs` (promoted W4 from the per-slice
W2a/W2b/W3 evidence harness — same gates, now the standing way any slice proves a
UI change across the three product shells).

## What one run produces

| Output | Contract it proves |
|---|---|
| Parity report (per route) | §4.3 — every interactive `data-testid` visible at 390 is present at 1280 |
| XOR report (per shell × 390/768/1024/1280) | §4.1 — tab bar XOR rail, never both |
| Shot matrix | §6.3 — {en,ar} × {light,dark} × {390,1280} per key route + 768/1024 rail states |
| `certify-results.json` | machine-readable record of all three, for diffing between runs |

Exit code is non-zero on any parity/XOR failure — the rig is a gate, not just a camera.

## Deterministic environment (the recipe)

The rig runs against a **local prod build** on the **seeded local stack** — same data
every run, so two packs from different commits differ only by the UI change:

```bash
# 1 · stack up + deterministic seed (idempotent)
supabase start                       # retry once if the storage container reports unhealthy
supabase db reset                    # replays all migrations
supabase status -o env > /tmp/sb-local.env
# API-role grants + the e2e gym seed (fixed slug ⇒ fixed fixtures):
docker exec -i supabase_db_proline-gym-platform \
  psql "postgresql://postgres:postgres@127.0.0.1:5432/postgres" \
  -c "SELECT seed_e2e_gym('proline-gym-local','E2eTestPass!23');"
# (see e2e/README / iso-db notes for the grant statements if the stack is from-zero)
# Optional on a loaded machine: docker stop supabase_studio_* supabase_pg_meta_*

# 2 · env-baked prod build + fresh server (a long-lived next start degrades — always fresh)
set -a; source /tmp/sb-local.env; set +a
E2E_TEST_MODE=1 npm run build
npx next start -p 3000 &

# 3 · the rig (two passes against a fresh server each — see NB in the script header)
E2E_GYM_SLUG=proline-gym-local CERTIFY_OUT=certify-artifacts \
  node scripts/design-audit/certify.mjs --shells portal,coach
# restart next, then:
E2E_GYM_SLUG=proline-gym-local CERTIFY_OUT=certify-artifacts \
  node scripts/design-audit/certify.mjs --shells staff,guardian

# 4 · teardown
supabase stop        # NEVER --no-backup (it deletes the data volume)
```

Logins are the seeded role accounts (`owner|coach|student|parent+proline-gym-local@e2e.local`).

## The stable route list

Lives in the `SHELLS` map at the top of `certify.mjs` — routes + keyRoutes per shell,
plus `dynamic` resolvers for id-bearing detail routes (staff Member-360, guardian
KidDashboard). **Pinned premises** are encoded there, not in the reader's head — e.g.
staff parity pins `/schedule?view=week` because the DA-22 mobile day-default is a
deliberate per-breakpoint view divergence the 390↔1280 comparison must not read as a
gap. A slice that adds a surface adds its route in the same commit.

## Diffing two runs

`certify-results.json` is stable-ordered (shells and routes in config order):
- gates: compare `parity[].missingAtDesktop` / `xor[].ok` directly (`jq` or eyeball);
- shots: filenames are deterministic (`<shell>-<route-slug>-<locale>-<theme>-<width>.png`),
  so a pixel diff of two packs (e.g. `compare` from ImageMagick, or a side-by-side
  eyeball of the changed routes) shows exactly what a slice altered.

Raw packs stay untracked (`certify-artifacts*/` is gitignored); each slice commits a
**curated** subset + its results JSON under `docs/design-system/shots-<slice>/`.

## CI wiring — PROPOSAL ONLY (auditor/owner decision; cost attached)

Not built. If wanted, the shape that fits the existing CI:
1. A manual-dispatch `certify.yml` job reusing the e2e workflow's stack-up steps
   (supabase CLI pinned 2.109.0, seeded gym, prod build), running both rig passes and
   uploading `certify-artifacts/` as a run artifact (~15–25 min, ~250 shots, ≈40 MB).
2. The parity/XOR gates (no shots) could additionally run per-PR — they're the cheap
   half (~4 min) and fail loudly on a testid regression.
3. Pixel-diff against a baseline pack is possible but noisy (fonts/AA drift across
   runners) — recommend keeping visual diffing a human step over the curated packs.
