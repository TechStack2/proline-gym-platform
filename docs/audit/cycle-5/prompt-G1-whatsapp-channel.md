# CODER PROMPT G1 — WhatsApp channel: wa.me bridge (day-1) + per-gym Cloud-API toggle

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after ON-1 merges (branch `prompt-g1-whatsapp` off post-ON-1 `main`). Design LOCKED: [`../design-demo-feedback-v1.md`](../design-demo-feedback-v1.md) §8 (operator answer — full functionality BEFORE Meta approval, activation after).

## Strategic context
Proline is excited about WhatsApp but worried about Cloud-API approval lead time. So G1 ships as a **channel abstraction with a per-gym toggle**: the **wa.me bridge works on day 1 with zero Meta approval** (staff taps a reminder → their own WhatsApp opens with a prefilled localized message), and when the gym's Cloud-API credentials go live, the *same* notifications auto-send — no rework. This is also the white-label "WhatsApp-native" selling point. **Tenant-clean; follow `docs/design-system.md`; Arabic-first.**

## Build

### 1. wa.me bridge — dock the documented slots (day-1, no approval, fully testable)
Prior slices left documented `wa.me` action slots; wire them all into a shared `waLink(phone, message)` helper (localized message templates, ar/en/fr, e.164 phone normalization via the existing phone util):
- **Chase list + renewals** (ML-1 Today cards): "remind about renewal" → wa.me to the member/payer with a prefilled localized renewal nudge.
- **Win-back** (FIN-1): "reach out" → wa.me re-engagement message.
- **Invoice / receipt** (D1): "send receipt" → wa.me with the invoice summary + amount (dual-currency per D1).
- **Lead reply** (GRW-1 Prospects): "reply on WhatsApp" → wa.me to the captured lead.
- **Registration/PT approvals + ON-1 credential share** (already partly done in ON-1): keep consistent via the same helper.
Each opens the staff member's own WhatsApp (`https://wa.me/<phone>?text=<encoded>`); no backend, no credentials. **This is the must-have and is fully e2e-verifiable.**

### 2. Per-gym WhatsApp settings (Settings → Configuration)
- **Migration (next free number):** `gym_whatsapp_config` (gym_id PK/unique, `status` enum `not_configured|pending|active`, `phone_number_id` TEXT, `waba_id` TEXT, encrypted `access_token` — store server-side only, never returned to the client; `default_country_code`, timestamps). Staff-write own-gym RLS; **the token column is never selectable by the client** (expose only status + masked presence via a SECURITY DEFINER reader or a server action — never send the token to the browser).
- **UI:** a WhatsApp card — status badge, credential fields (write-only from the client's perspective; submit via a server action that stores them), a "Send test message" button, and a clear "until active, reminders use the share-to-WhatsApp buttons" explainer.

### 3. Channel dispatch abstraction (Cloud-API ready, activates on toggle)
- A server-side `dispatchWhatsApp(gymId, toPhone, template, vars)`: looks up the gym's config; if `status='active'` and credentials present → enqueue an **`outbound_messages`** row (gym_id, to_phone, body, template, `status` queued/sent/failed, error, timestamps) and call the **Cloud API provider** (`src/lib/whatsapp/provider.ts` — real `POST https://graph.facebook.com/.../messages` with the gym's token); on non-active gyms → **no-op** (the in-app notification + wa.me bridge remain the path). The existing F2 in-app notification ALWAYS fires regardless (WhatsApp is additive, never a replacement).
- **Wire it into the lifecycle/notification producers** that should also reach WhatsApp when active: renewal nudge, dunning reminder, registration/PT approval, trial-inquiry ack. Best-effort (a WhatsApp send failure NEVER rolls back the primary write or the in-app notification — the GRW-1 lesson).
- **Test seam (so CI can verify the routing without Meta):** the provider reads a `WHATSAPP_PROVIDER_MODE` env — `live` (real HTTP) vs `record` (writes the `outbound_messages` row with status `sent` but makes NO external call). CI runs `record`. This verifies the **routing decision** (active gym → outbound row created; inactive gym → none) and the queue, NOT Meta's servers.

## Out of scope
Inbound WhatsApp / two-way chat; template pre-approval management UI; switching member LOGIN to phone-OTP (separate — note it needs the Supabase phone provider enabled, per ON-1); broadcast/marketing blasts; the real Meta HTTP call under CI (record-mode only).

## Verify (e2e, ephemeral TI gym)
1. **wa.me bridge (day-1 path):** on a not-configured gym, the chase/renewal/win-back/lead/receipt actions each render a valid `wa.me/<phone>?text=<localized>` link (assert href + that the message is localized under `/ar`); no backend call.
2. **Settings:** staff saves WhatsApp credentials → status reflects (`pending`/`active`); the access token is **never present in any client response/HTML** (assert it's absent from the page payload).
3. **Dispatch routing (record-mode):** seed a gym `active` with creds → trigger a renewal nudge (ML-1 tick / staff action) → an `outbound_messages` row is created (status sent, record-mode, no external call) AND the in-app notification still fires; on a not-configured gym the same action creates the in-app notification + NO outbound row.
4. **Best-effort:** a forced provider error (record-mode injectable) does NOT roll back the renewal/notification.
5. Full suite green — no regression (ON-1's count + G1 tests).

## Acceptance
1. The proofs green in E2E CI (run ID/URL); wa.me links localized; token never client-exposed (`database-reviewer` + the payload assertion).
2. Real-columns/RLS: `gym_whatsapp_config` token unreadable by client; `outbound_messages` gym-scoped; dispatch best-effort; in-app notification path unchanged.
3. Cloud-API provider implemented (live mode) but CI uses record-mode; operator-activation documented.
4. i18n ar/en/fr; RTL; design-system; `tsc`+`build` clean.

## Hygiene
Branch `prompt-g1-whatsapp` off post-ON-1 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations via Verify-Foundation before e2e; **never commit any token**; never weaken RLS; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / G1 — WhatsApp channel`: the wa.me bridge surfaces, the config/token-security design, the dispatch abstraction + record-mode seam, the operator-activation steps, CI run ID/URL, an explicit **"wa.me bridge live (no approval) + active-gym auto-dispatch routing + token never client-exposed: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **F3-lean** (waiver/consent record + signature capture).

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms ON-1 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-g1-whatsapp off main (git checkout main && git pull && git checkout -b prompt-g1-whatsapp
— main must contain ON-1; verify src/lib/supabase/admin.ts exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-G1-whatsapp-channel.md
design: docs/audit/design-demo-feedback-v1.md §8 (LOCKED: wa.me works day-1 sans Meta approval; Cloud API
on a per-gym toggle; activation = zero rework)

Do: (1) wa.me BRIDGE (day-1, no backend, fully testable): a shared waLink(phone, message) helper
(localized ar/en/fr templates + e.164 normalization via the existing phone util) docked into ALL the
documented slots — chase list + renewals (ML-1 Today cards), win-back (FIN-1), invoice/receipt share (D1,
dual-currency), lead reply (GRW-1 Prospects), and keep ON-1's credential share consistent; each opens the
staff member's own WhatsApp (https://wa.me/<phone>?text=<encoded>). (2) PER-GYM SETTINGS: migration (next
free number) gym_whatsapp_config (gym_id unique, status not_configured|pending|active, phone_number_id,
waba_id, ENCRYPTED access_token NEVER returned to client, default_country_code) + staff-own-gym RLS with
the token column unreadable by the client (status/presence via SECURITY DEFINER reader or server action
only); a WhatsApp settings card (status badge, write-only credential fields via a server action, "send
test", "until active, use the share buttons" explainer). (3) DISPATCH ABSTRACTION: server-side
dispatchWhatsApp(gymId,toPhone,template,vars) → if gym active+creds: enqueue outbound_messages row
(gym_id,to_phone,body,template,status,error) + call src/lib/whatsapp/provider.ts (real graph.facebook.com
POST in live mode); else no-op; the F2 in-app notification ALWAYS fires regardless (WhatsApp is additive);
best-effort (a send failure NEVER rolls back the primary write/notification — GRW-1 lesson); wire into
renewal nudge, dunning, registration/PT approval, trial-inquiry ack. TEST SEAM: provider reads
WHATSAPP_PROVIDER_MODE — live (real HTTP) vs record (writes outbound row status=sent, NO external call);
CI uses record. Out of scope: inbound/two-way, template-approval UI, phone-OTP login swap (note it needs
Supabase phone provider enabled per ON-1), marketing blasts, real Meta HTTP under CI.
Verify in the E2E CI run, not tsc: not-configured gym → chase/renewal/win-back/lead/receipt render valid
wa.me/<phone>?text=<localized> links (assert href + Arabic message under /ar), no backend; staff saves
creds → status reflects + access token ABSENT from any client payload/HTML (assert); active+creds gym
(seed, record-mode) → renewal nudge creates an outbound_messages row (status sent, no external call) AND
the in-app notification still fires; not-configured gym → in-app notification + NO outbound row; forced
provider error → no rollback of renewal/notification; FULL suite green (no regression). Apply migration
via Verify-Foundation with -f apply=true BEFORE e2e. If the sandbox can't run the browser, push so
e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000; scoped git add + git show --stat;
NEVER commit a token; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / G1 — WhatsApp channel": the wa.me
surfaces, config/token-security design, dispatch+record-mode seam, operator-activation steps, CI run
ID/URL, an explicit "wa.me bridge live (no approval) + active-gym auto-dispatch routing + token never
client-exposed: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me G1 is ready for review.
```
