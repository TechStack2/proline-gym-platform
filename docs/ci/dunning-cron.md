# Scheduled dunning (WhatsApp renewal reminders)

Auto-dunning (SAFETY: per-gym opt-in, **default OFF**) sends WhatsApp reminders for
overdue/upcoming renewal invoices. The *logic* ships live but **dormant** — nothing
is scheduled until an owner turns it on. This doc is that switch.

## How it works

- **Endpoint:** `POST /api/cron/dunning` (`src/app/api/cron/dunning/route.ts`).
  - **Inert by default:** with no `CRON_SECRET` in the app's env the route is a
    `204` no-op — it can never fire accidentally.
  - With `CRON_SECRET` set, a caller must send `Authorization: Bearer <CRON_SECRET>`
    (else `401`).
  - When authorized it iterates **active** gyms and runs each one's dunning
    dispatch. A gym only messages anyone if **it** set `auto_dunning_enabled = true`.
- **Trigger:** `.github/workflows/dunning-cron.yml` (a GitHub Actions cron),
  **disabled by default**.
- **WL-aware:** each reminder is signed with that gym's own localized name.
- **Idempotent:** a given reminder (invoice + nudge) is sent at most once — the
  outbound `dedup_key` guarantees no double-send across runs.

## Turn it on — 2 steps

1. **Set the `CRON_SECRET` secret.**
   - App env (Railway): add `CRON_SECRET=<a long random string>` and redeploy. This
     alone makes the route live (it stops returning `204`). Nothing sends yet — no
     scheduler is calling it.
   - Repo secret (GitHub → Settings → Secrets and variables → Actions → New
     repository secret): add `CRON_SECRET` with the **same** value.
   - *(Optional)* add an `APP_URL` repo secret if your deployment URL isn't the
     default in the workflow.

2. **Enable the schedule.** In `.github/workflows/dunning-cron.yml`, uncomment the
   `schedule:` block and commit. The daily sweep now runs (default 06:30 UTC).

To test before enabling the schedule: after step 1, run the workflow manually
(Actions → "Dunning cron (disabled by default)" → **Run workflow**).

## Turn it off

Comment out the `schedule:` block again (or delete the repo `CRON_SECRET`, or unset
it in the app env — any one of those returns the system to fully dormant).
