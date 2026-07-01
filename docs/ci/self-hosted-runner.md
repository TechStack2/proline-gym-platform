# Self-hosted e2e runner (macOS owner setup)

Run the **E2E Verification (behavior-green gate)** on the owner's Mac instead of a
GitHub-hosted `ubuntu-latest` runner — to cut GitHub Actions minutes/budget, or to
run the gate when Actions is capped.

There are **two independent ways** to run the gate off GitHub-hosted infra; use the
one that fits:

1. **Local, no runner** — [`scripts/e2e-local.sh`](../../scripts/e2e-local.sh)
   (`npm run e2e:local`). Runs the exact same steps as the workflow on this Mac, in
   your shell. No GitHub involvement. **Start here** — it needs no setup and no
   security trade-off. `PROJECTS="on1" npm run e2e:local` for a targeted slice.
2. **Self-hosted runner** — register this Mac as a GitHub Actions runner and
   dispatch the workflow with `runner: self`. Use this only if you want the run to
   appear as a GitHub check (status on the PR/commit). Read the security caveat
   first.

---

## ⚠️ Security caveat — PRIVATE repositories ONLY

**Never attach a self-hosted runner to a _public_ repository.** A public-repo
self-hosted runner will execute workflow code from **fork pull requests** — i.e.
arbitrary code from anyone on the internet — directly on your machine, with your
filesystem, credentials, and network. GitHub explicitly warns against this.

`proline-gym-platform` **is currently public** (see commit `655c2dd` — the repo went
public and a service-role key had to be rotated). Therefore, **do not register a
self-hosted runner on it as-is.** Only self-host after the repo is made private, or
on a private fork/mirror. The `runner: self` input in `e2e.yml` is **built but
inert** (default `hosted`) precisely so nothing self-hosts by accident — it is a
no-op until (a) the repo is private and (b) a runner is registered and (c) someone
dispatches with `runner: self`.

For the "just run the gate locally" case, prefer option 1 (`npm run e2e:local`) —
it carries none of this risk because GitHub never schedules anything on your Mac.

---

## Prerequisites (already present on this Mac)

The gate needs the same tooling the local script uses:

- **Docker Desktop** — the Supabase stack (Postgres + GoTrue + Storage + PostgREST)
  runs in Docker. Must be running before a job starts.
- **Supabase CLI** (`supabase`) — `brew install supabase/tap/supabase`.
- **Node** — CI pins **Node 20**; install it (`brew install node@20` or
  `nvm install 20`) so the runner matches. This Mac's default is Node 24; a
  self-hosted job uses whatever `node` is on the runner's `PATH`, so pin 20 for
  parity (the local script documents the same skew).
- **psql** — needed only for the **self-hosted runner path** (the workflow applies
  the API-role grants + seeds gyms via `psql`). The workflow's install step is
  Linux `apt-get`; on a macOS runner install it with `brew install libpq` and add
  `$(brew --prefix libpq)/bin` to the runner's `PATH`. **The local script
  (`npm run e2e:local`) does NOT need host psql** — it falls back to the stack's own
  Postgres container (`supabase_db_<project_id>`), which bundles `psql`.

Verify:

```bash
docker info >/dev/null && echo "docker ok"
supabase --version
node --version      # want v20.x for CI parity
psql --version      # only for the self-hosted runner path; the local script falls back to the container
```

---

## Register the runner (private repo only)

1. On GitHub: **Repo → Settings → Actions → Runners → New self-hosted runner**,
   choose **macOS / ARM64**. GitHub shows a `config.sh` command with a
   short-lived registration token.
2. In a working dir on the Mac (e.g. `~/actions-runner`):

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   # download URL + token come from the GitHub "New runner" page:
   curl -o actions-runner-osx-arm64.tar.gz -L <URL_FROM_GITHUB>
   tar xzf actions-runner-osx-arm64.tar.gz
   ./config.sh --url https://github.com/<owner>/proline-gym-platform \
               --token <TOKEN_FROM_GITHUB> \
               --labels self-hosted,macos \
               --name proline-mac-runner \
               --work _work
   ```

   The `self-hosted` label is what `e2e.yml`'s `runs-on` resolves to when dispatched
   with `runner: self`.

---

## Run as a background service (launchd)

The runner ships a launchd wrapper — no hand-written plist needed:

```bash
cd ~/actions-runner
./svc.sh install     # registers a per-user LaunchAgent
./svc.sh start       # start now + on login
./svc.sh status      # verify it's listening
```

Docker Desktop must be set to **start on login** (Docker Desktop → Settings →
General → "Start Docker Desktop when you sign in"), otherwise a job will fail at
`supabase start` because the daemon isn't up.

---

## Trigger a run on the self-hosted runner

Only after the repo is private and the runner is registered + online:

```bash
# targeted slice
gh workflow run e2e.yml --ref <branch> -f runner=self -f projects="on1"
# full union gate
gh workflow run e2e.yml --ref <branch> -f runner=self
```

`push`-triggered runs (the main union gate) do **not** set `runner`, so they stay on
`ubuntu-latest` — self-hosting is strictly opt-in per dispatch.

---

## Teardown

Stop and remove the service + deregister the runner:

```bash
cd ~/actions-runner
./svc.sh stop
./svc.sh uninstall            # remove the LaunchAgent
./config.sh remove --token <REMOVAL_TOKEN_FROM_GITHUB>   # deregister from the repo
```

Then delete `~/actions-runner`. To also reclaim Docker space used by the stack:

```bash
supabase stop --no-backup || true
docker system prune -f
```

If you only ever used option 1 (`npm run e2e:local`) there is nothing to tear down —
the script already stops the stack on exit via its cleanup trap.
