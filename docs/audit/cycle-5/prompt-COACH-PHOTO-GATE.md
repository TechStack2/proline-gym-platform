# CODER PROMPT COACH-PHOTO-GATE — stage the coach photo through the same admin gate as the text

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-coach-photo-gate` off `main`. **Closes the one COACH-LP scope gap.** COACH-LP gated bio/specialty (coach edits → draft → admin publishes), but the **photo** still updates *live* via the existing ADM-2 uploader — so a published coach's headshot hits the public landing **without admin approval**. The original slice reserved `coach_profile_pending.avatar_url` for this follow-up because the avatars bucket's **path-scoped Storage RLS** fought a draft-photo path. This slice resolves that and brings the photo under the same gate as the text.

## Build
1. **Draft photo upload (coach side):** the coach's profile editor uploads a new photo to a **draft location** the public cannot read — either a `pending/`-prefixed Storage path or a separate draft bucket — recorded in `coach_profile_pending.avatar_url` (the reserved column). The Storage **RLS must allow** the coach (own) + staff (in-gym) to write/read the draft path, and **deny anon** (mirror the no-anon-leak principle COACH-LP used for the text drafts). This is the fiddly part the original slice deferred — get the path-scoped policy right (name any new policy; don't weaken the existing avatars RLS).
2. **Publish applies the photo:** extend `publish_coach_profile` so that, when publishing, it promotes the draft photo (`pending.avatar_url`) to the **live** coach avatar (the field the landing/`get_landing_coaches` reads) alongside the text — atomically, owner/head_coach-gated (the existing gate). After publish, clear the pending photo.
3. **Staff diff:** the Coach-360 `CoachPublishPanel` shows the pending **photo** (before/after) alongside the text diff, so the admin reviews the headshot before the final push.

## Out of scope
The text workflow (done in COACH-LP); the showcase seed; non-photo profile fields; weakening any existing avatars Storage RLS.

## Verify (e2e, ephemeral TI gym)
1. **Gate proven for the photo:** a coach uploads a new photo → it's **pending** (the *live* landing avatar is unchanged + the draft is NOT anon-readable); owner publishes in Coach-360 → the **new photo is now live** on the anon landing.
2. **Reception can't publish the photo** (same owner/head_coach gate); RLS leak-guard — the draft photo path is **not anon-accessible**. `/ar` clean; full suite green (no regression to ADM-2 avatar upload elsewhere, e.g. the dashboard coach-detail uploader).

## Acceptance
1. The coach photo now flows draft → admin-publish → live (same gate as the text); the draft photo is RLS-isolated from anon; publish is owner/head_coach-gated; green in E2E CI (run ID/URL).
2. `database-reviewer`: the new Storage/draft-photo policy is least-privilege + named; existing avatars RLS not weakened; `publish_coach_profile` change atomic + gated.

## Hygiene
Branch `prompt-coach-photo-gate` off `main`; **dev port 3000**; migration (if any) via Verify-Foundation before e2e; scoped `git add`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "COACH-PHOTO-GATE ready" + CI run ID.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / COACH-PHOTO-GATE`: the draft-photo Storage path + RLS, the publish-applies-photo change, the Coach-360 photo diff, CI run ID/URL, an explicit **"coach photo flows draft→admin-publish→live; draft not anon-readable; publish owner/head_coach-only: PASS/FAIL"** line, and a DRAG READ.
