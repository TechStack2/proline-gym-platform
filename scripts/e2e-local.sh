#!/usr/bin/env bash
#
# scripts/e2e-local.sh — run the e2e behavior-green gate LOCALLY (no GitHub Actions).
#
# Replicates the run steps of .github/workflows/e2e.yml on this Mac so the gate can
# be run without GitHub Actions (e.g. when the Actions budget is capped, or for a
# fast local pre-push check). It boots an ISOLATED local Supabase stack, replays all
# migrations from zero, applies the cloud-parity API-role grants, seeds one gym per
# worker slot, builds, then runs Playwright. The stack is always torn down on exit
# (trap), so a crashed/cancelled run never leaks a half-up stack.
#
# Usage:
#   ./scripts/e2e-local.sh                          # FULL suite (every project)
#   PROJECTS="on1" ./scripts/e2e-local.sh           # TARGETED: setup + smoke + on1
#   PROJECTS="portal-shell coach-shell" ./scripts/e2e-local.sh
#   PW_ARGS="--repeat-each=2" PROJECTS="off2" ./scripts/e2e-local.sh
#   E2E_WORKERS=2 PROJECTS="b3" ./scripts/e2e-local.sh   # override worker/gym count
#
# Knobs (env):
#   PROJECTS     space-separated playwright projects; empty = FULL suite (default)
#   PW_ARGS      extra args appended to `playwright test` (mirrors the CI pw_args input)
#   E2E_WORKERS  worker slots = isolated gyms seeded = playwright workers (default 2, == CI)
#
# ── NODE-20 PARITY NOTE ───────────────────────────────────────────────────────────
# CI pins Node 20 (`actions/setup-node` → node-version: 20). This Mac runs Node 24.
# The build + e2e harness are Node-version-tolerant, so a green here is normally a
# faithful CI signal — BUT if you hit a failure that reproduces ONLY locally, rule
# out the version skew by re-running under Node 20 (`nvm use 20` / `fnm use 20`)
# before treating it as a real red. Everything else (stack, migrations, seeds,
# grants, env, workers) is byte-for-byte the CI path.
# ──────────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root, regardless of caller's CWD

# ── CI job env (parity with e2e.yml `env:`) — every value is a test value, NO secrets ──
# CI=true is REQUIRED for parity: playwright.config keys `workers` off E2E_WORKERS
# only when CI is set, and starts its OWN `next start` (reuseExistingServer:!CI).
export CI="${CI:-true}"
export WHATSAPP_PROVIDER_MODE="record"                 # no external Meta call (queue is written)
export WHATSAPP_TOKEN_ENC_KEY="ci-test-enc-key-not-a-secret"
export E2E_PASSWORD="E2eTestPass!23"                   # matches the seed default
export E2E_TEST_MODE="1"                               # disable the per-IP auth rate limit (test-only)
export CRON_SECRET="e2e-cron-secret-not-a-real-secret" # SCHEDULER-WIRE: makes /api/cron/dunning active for its guard
export E2E_WORKERS="${E2E_WORKERS:-2}"                 # worker slots = gyms = playwright workers
export NEXT_PUBLIC_DEFAULT_LOCALE="en"
export NEXT_PUBLIC_SUPPORTED_LOCALES="ar,en,fr"

PROJECTS="${PROJECTS:-}"
PW_ARGS="${PW_ARGS:-}"
START_TS=$(date +%s)

# ── trap cleanup: ALWAYS stop the stack (mirrors the `if: always()` teardown step) ──
cleanup() {
  local code=$?
  echo "▶ Tearing down the local Supabase stack…"
  supabase stop --no-backup >/dev/null 2>&1 || true
  local dur=$(( $(date +%s) - START_TS ))
  if [ "$code" -eq 0 ]; then
    echo "✅ e2e-local PASSED in ${dur}s  (projects: ${PROJECTS:-<full suite>})"
  else
    echo "❌ e2e-local FAILED (exit ${code}) after ${dur}s  (projects: ${PROJECTS:-<full suite>})"
  fi
}
trap cleanup EXIT

# ── preflight: tooling + docker daemon + a free app port (3000) ──
# NOTE: psql is NOT required on the host — if it's absent we fall back to the local
# stack's OWN Postgres container (which bundles psql), so the assumed deps stay
# Docker/supabase/Node (see docs/ci/self-hosted-runner.md).
for bin in supabase docker node npx; do
  command -v "$bin" >/dev/null 2>&1 || { echo "::missing required dependency: $bin"; exit 127; }
done
docker info >/dev/null 2>&1 || { echo "Docker daemon is not running — start Docker Desktop and retry."; exit 1; }
if lsof -nP -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Port 3000 is in use (a dev server?). Playwright starts its own \`next start\` there — stop it first."
  exit 1
fi

echo "▶ [1/8] supabase start (idempotent — no-op if the stack is already up)…"
# Retry the boot: the storage container occasionally fails its health check on a
# cold first start (rolls the whole `start` back). A stop + retry clears it. This
# is a local-boot reliability guard only — it never masks a test result.
start_attempts=0
until supabase start; do
  start_attempts=$((start_attempts + 1))
  if [ "$start_attempts" -ge 3 ]; then
    echo "::supabase start failed after ${start_attempts} attempts"; exit 1
  fi
  echo "  ⚠ supabase start failed (attempt ${start_attempts}/3) — stopping + retrying…"
  supabase stop --no-backup >/dev/null 2>&1 || true
  sleep 5
done

echo "▶ [2/8] supabase db reset (replay ALL migrations from zero)…"
supabase db reset

echo "▶ [3/8] capture the local stack URL + keys…"
supabase status -o env > /tmp/sb-local.env
set -a; . /tmp/sb-local.env; set +a
export NEXT_PUBLIC_SUPABASE_URL="${API_URL}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"
export SUPABASE_DB_URL="${DB_URL}"
export E2E_GYM_SLUG_BASE="e2e-local-$(date +%s)"       # unique per run; db reset wipes anyway
echo "  local stack at ${API_URL}; gym base=${E2E_GYM_SLUG_BASE}; workers=${E2E_WORKERS}"

# ── resolve psql: prefer a HOST psql (CI parity); else run the stack's OWN Postgres
#    container psql so the host needs no psql install. `psql_run …` runs SQL either
#    way (heredoc on stdin or -tAc), against this project's DB. ──
PROJECT_ID="$(sed -nE 's/^project_id = "(.*)"/\1/p' supabase/config.toml | head -1)"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
if command -v psql >/dev/null 2>&1; then
  echo "  psql: host binary ($(command -v psql))"
  psql_run() { psql "${SUPABASE_DB_URL}" "$@"; }
else
  echo "  psql: host binary absent → using the stack's container psql (${DB_CONTAINER})"
  # Inside the container Postgres listens on localhost:5432 (default local password).
  psql_run() { docker exec -i "${DB_CONTAINER}" psql "postgresql://postgres:postgres@127.0.0.1:5432/postgres" "$@"; }
fi

echo "▶ [4/8] grant API-role privileges (local↔cloud parity; RLS still governs rows)…"
psql_run -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
-- Storage parity (avatar uploads): same out-of-band grant gap on the storage schema.
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects, storage.buckets TO authenticated, service_role;
GRANT SELECT ON storage.objects, storage.buckets TO anon;
SQL
echo "  ✅ API-role grants applied (public + storage)"

echo "▶ [5/8] seed one ISOLATED gym per worker slot (<base>-w0 … w<N-1>)…"
for w in $(seq 0 $((E2E_WORKERS - 1))); do
  SLUG="${E2E_GYM_SLUG_BASE}-w${w}"
  psql_run -v ON_ERROR_STOP=1 -tAc \
    "select seed_e2e_gym('${SLUG}', '${E2E_PASSWORD}');" >/dev/null
  echo "  ✅ seeded ${SLUG}"
done

echo "▶ [6/8] install deps (npm ci only if node_modules is absent) + Playwright chromium…"
[ -d node_modules ] || npm ci
npx playwright install chromium      # macOS: no --with-deps (that flag is the Linux apt path)

echo "▶ [7/8] build (bakes NEXT_PUBLIC_* → the local stack)…"
npm run build

echo "▶ [8/8] run the Playwright harness…"
if [ -n "${PROJECTS// /}" ]; then
  # ── TARGETED: setup + smoke + the named projects (E2E_TIERED=1 materializes `smoke`) ──
  ARGS="--project=setup --project=smoke"
  for p in ${PROJECTS}; do ARGS="$ARGS --project=$p"; done
  echo "  ▶ TARGETED run: setup + smoke + [${PROJECTS}] ${PW_ARGS}"
  E2E_TIERED=1 npx playwright test $ARGS ${PW_ARGS}
else
  # ── FULL union gate (every project) — the regression guard, unchanged ──
  echo "  ▶ FULL union gate (all projects) ${PW_ARGS}"
  npm run test:e2e -- ${PW_ARGS}
fi

# Success/teardown/timing are handled by the EXIT trap.
