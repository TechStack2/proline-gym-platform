# CODER PROMPT INVITE-PHONE-UX — members log in with their PHONE + password (synthetic email stays under the hood)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-invite-phone-ux` off `main`. **Owner-chosen Option B — NO Supabase auth-provider change** (phone provider stays disabled). **Owner-reported:** the invite creates a "weird" account — the synthetic email `m-{profileId}@members.proline.lb`. Make the member's **username = their phone number + a password**; keep the synthetic email purely as the hidden auth identifier.

## Why (recon)
- Invite creates the auth user with a **synthetic email** `m-${profileId}@members.proline.lb` ([`src/lib/provisioning/invite.ts:78`](src/lib/provisioning/invite.ts#L78)) because **phone+password sign-in is disabled on Supabase GoTrue** ([[phone-logins-disabled]]). That synthetic email is the "weird" name staff copy-paste to the member ([`src/components/shared/invite-button.tsx:65`](src/components/shared/invite-button.tsx#L65)).
- The login page already detects a phone-shaped input and *tries* `signInWithPassword({ phone, password })` ([`src/app/[locale]/auth/login/page.tsx`](src/app/[locale]/auth/login/page.tsx) ~:68–70) — which **fails** (phone disabled).

## Build — phone is the username; resolve→email→sign-in under the hood
1. **Invite shows the PHONE, not the synthetic email.** `invite.ts` already has the phone — return it; `invite-button.tsx` + the WhatsApp share template show **"log in with your phone {phone} + temp password {pw}"** (drop the `m-…@members.proline.lb` from what staff sees/shares). The synthetic email stays only as the internal auth identifier.
2. **Phone login works via server-side resolution (NOT an anon enumeration oracle).** When the login input is phone-shaped, sign in through a **server action** (service-role admin client, server-side): resolve the phone → the member's synthetic login email → `signInWithPassword({ email, password })` server-side, set the session cookies (`@supabase/ssr`), and return a **generic result**.
   - **Security (required):** a wrong phone and a wrong password must both return the **same generic "invalid credentials"** (no account-existence enumeration); **rate-limit** the resolution (reuse the existing auth rate-limit infra). Do NOT expose an anon `phone→email` RPC that returns email-or-null (that's an enumeration oracle). Prefer the server-action-does-the-full-sign-in pattern.
   - Verify the resulting session **hydrates the client** (cookies set by the SSR server client → the browser is logged in after redirect).
3. **Backward-compatible:** email sign-in still works (staff use email; the synthetic email still works as a fallback). Don't break the existing email path.

## Out of scope
Enabling the Supabase phone provider (that's Option A, declined); the demo guardian login; changing how the auth user is created (keep the synthetic email as the identifier); OTP/G1.

## Verify
1. A freshly-invited member logs in with **their phone number + temp password** and lands in the portal; the invite UI shows the **phone** as the login (no synthetic email surfaced to staff).
2. **No enumeration:** wrong phone and wrong password both yield the same generic error; resolution is rate-limited.
3. Staff **email** login still works; the synthetic email still works as a fallback.
4. `/ar` (RTL) + `/en`; **TARGETED run** (`-f projects="<on1/login>"`) — assert a phone+password login succeeds end-to-end (invite → onboard → log in by phone).

## Acceptance
1. Members authenticate with phone + password (synthetic email hidden, resolved server-side); invite UI shows the phone; generic failure (no enumeration) + rate-limited; email login intact; no Supabase provider change; `/ar`+`/en`; green on a targeted run (run ID/URL). If a migration is introduced (e.g. a guarded resolver), it's additive + the auditor VF-applies it — but the server-action+service-role path needs none.

## Hygiene
Branch `prompt-invite-phone-ux` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **never weaken RLS**; **no anon enumeration oracle** (generic failure + rate-limit); service-role key stays server-side only; **validate TARGETED**; **DO NOT merge** — report "INVITE-PHONE-UX ready" + run ID (+ any migration basename for VF); the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / INVITE-PHONE-UX — phone-as-username login`: the synthetic-email-stays-hidden design, the server-side resolve→email→sign-in (generic failure, rate-limited, no enumeration), the invite-display change, the targeted run ID, an explicit **"member logs in by phone+password; no enumeration; email login intact; no Supabase change; /ar+/en: PASS/FAIL"** line, and a DRAG READ.
