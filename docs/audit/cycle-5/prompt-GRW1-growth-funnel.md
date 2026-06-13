# CODER PROMPT GRW-1 — Growth: landing trial capture, lead sources, funnel stats, tracked links/QR

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after FIN-1 merges (branch `prompt-grw1-growth` off post-FIN-1 `main`). Design: [`../design-demo-feedback-v1.md`](../design-demo-feedback-v1.md) §4 (client buying criterion, pulled from the V2 cut; forks locked incl. tracked links/QR).

## Strategic context
Lebanese gyms acquire through Instagram ads and shares — and today the landing's CTA is a dead end for a logged-out visitor: no capture, no attribution, no funnel. This slice closes the top of the funnel the 23R pipeline already serves: **visitor → captured lead (with source/campaign) → staff notified → Prospects → trial (UX-2 loop) → convert**, with the owner able to see WHICH ad produced WHAT. White-label differentiator. **Tenant-clean; follow `docs/design-system.md`.**

## Build

### 1. Migration (next free number)
- Verify `leads` REAL columns first (23R-era; UX-2 added source chips — confirm what exists; add `source` and/or `campaign_id` only if missing).
- **`campaigns`** (gym-scoped): name, `code` (short URL-safe slug, unique per gym), source label, is_active, timestamps. Staff RLS (own gym); **no anon read needed** (the code arrives via URL; resolution happens inside the RPC).
- **`submit_trial_inquiry` RPC** (SECURITY DEFINER, `REVOKE FROM PUBLIC`, **GRANT anon** — the landing is logged-out): inputs gym slug, name, phone, interest (discipline id optional), campaign code (optional), honeypot field. Guards inside: active gym by slug; basic validation (lengths, phone shape); **spam control** — honeypot must be empty + per-phone-per-gym dedup window (24h: same phone updates the existing fresh lead instead of duplicating); resolves campaign code → attribution; inserts the lead (status new, source from campaign or 'website') + **staff notification inside the RPC** (the ML-1 definer pattern — anon can't run the F2 producer). Returns only ok/duplicate (no data leak to anon).

### 2. Landing capture
"Book a free trial" section/CTA becomes a real **capture form** (name + phone + interest chips from the gym's anon-readable disciplines + hidden honeypot + hidden campaign code from `?c=`): submit → RPC → localized success state ("we'll contact you on WhatsApp"). Design-system styled; works logged-out; ar/en/fr.

### 3. Campaigns + tracked links/QR (staff)
A **Campaigns** surface (Settings Configuration or Prospects header — coder's call, named): create campaign (wizard: name, source label) → it shows its **tracked link** (`/{locale}?c=CODE`, copy button) and a **QR code** (client-side generation — a small standard dep like `qrcode` is approved) ready to screenshot into an IG post/flyer; archive pattern; per-campaign stats row (leads → trials → conversions, computed).

### 4. Funnel stats (Prospects)
Prospects gains a compact stats strip: counts by stage (existing chips already count — extend), **conversion rate** (converted ÷ total, period-scoped), and **by-source / by-campaign breakdown** (leads → trial-done → converted per source). Tables+numbers per the design system; date-range scope (this month default).

### 5. Notifications + docking
Captured leads notify staff (in-RPC); fresh inquiries surface via the existing Prospects highlight + (if cheap) a horizon-card row in FIN-1's "new leads in horizon". Leave the wa.me quick-reply slot on the lead row documented for G1.

## Out of scope
Email/SMS sending; paid-ad API integrations; multi-step campaign builders; lead scoring. Public form CAPTCHAs (honeypot + dedup suffice for V1 — note it).

## Verify (e2e, ephemeral TI gym)
1. **Capture:** anon visitor on the run gym's landing submits the form (with `?c=` of a staff-created campaign) → lead exists with source+campaign attribution → staff notified → appears in Prospects highlighted as new.
2. **Spam guards:** filled honeypot → rejected silently (no lead); same phone resubmitted within the window → no duplicate (updates the fresh lead).
3. **Campaign loop:** campaign page shows the link + QR renders (assert the QR svg/canvas exists); after the captured lead converts (23R RPC), the campaign row's stats show 1 lead → 1 conversion; Prospects conversion-by-source reflects it.
4. Full suite green — no regression (FIN-1's count + GRW-1 tests).

## Acceptance
1. The three proofs green in E2E CI (run ID/URL); anon write path reviewed by `database-reviewer` (RPC guards, REVOKEs, no anon table grants beyond the existing catalog reads, notification-in-RPC).
2. Real-columns audit of `leads` reported; additions named.
3. i18n ar/en/fr; RTL; design-system styled; `tsc`+`build` clean.

## Hygiene
Branch `prompt-grw1-growth` off post-FIN-1 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations via Verify-Foundation before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / GRW-1 — Growth funnel`: the anon-RPC guard design, leads real-columns audit, the campaign/QR mechanics, CI run ID/URL, an explicit **"Anon capture → attributed lead → staff notified → funnel stats: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **ON-1** (accounts, external share, onboarding — elevated scope).

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms FIN-1 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-grw1-growth off main (git checkout main && git pull && git checkout -b prompt-grw1-growth
— main must contain FIN-1; verify the member_followups table exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-GRW1-growth-funnel.md
design: docs/audit/design-demo-feedback-v1.md §4 (client buying criterion; tracked links/QR locked IN)

Do: (1) MIGRATION (next free number): verify leads REAL columns first (UX-2 added source chips — add
source/campaign_id only if missing); campaigns table (gym-scoped: name, unique-per-gym URL-safe code,
source label, is_active) with staff-own-gym RLS and NO anon read; submit_trial_inquiry SECURITY DEFINER
RPC (REVOKE FROM PUBLIC, GRANT anon): active gym by slug, length+phone validation, honeypot-must-be-
empty, per-phone-per-gym 24h dedup (update the fresh lead, don't duplicate), campaign-code → attribution
(else source 'website'), insert lead status=new + STAFF NOTIFICATION INSIDE THE RPC (ML-1 definer
pattern — anon can't run the F2 producer), return only ok/duplicate. (2) LANDING: the trial CTA becomes
a real capture form (name + phone + interest chips from anon-readable disciplines + hidden honeypot +
hidden ?c= campaign code) → RPC → localized success ("we'll contact you on WhatsApp"); logged-out;
ar/en/fr; design-system styled. (3) CAMPAIGNS surface (Settings Configuration or Prospects header —
your call, named): create via wizard (name, source label) → shows tracked link /{locale}?c=CODE with
copy button + client-side QR (small standard dep like `qrcode` approved) + per-campaign stats row
(leads → trials → conversions); archive pattern. (4) PROSPECTS funnel strip: stage counts, conversion
rate (period-scoped, month default), by-source/by-campaign breakdown (leads → trial-done → converted);
tables+numbers. (5) Fresh inquiries highlight in Prospects; document the wa.me quick-reply slot on lead
rows for G1. No CAPTCHA (honeypot+dedup suffice — note it), no email/SMS, no ad-API integrations.
Verify in the E2E CI run, not tsc: anon submits with ?c= of a staff-created campaign → lead with
source+campaign + staff notified + highlighted in Prospects; filled honeypot → silently no lead; same
phone within window → no duplicate; campaign page shows link + QR renders (assert element); convert the
captured lead (23R) → campaign stats 1 lead→1 conversion + by-source reflects; FULL suite green (no
regression). Apply migrations via Verify-Foundation with -f apply=true BEFORE e2e. If the sandbox can't
run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000; scoped
git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / GRW-1 — Growth funnel": the anon-RPC
guard design, leads real-columns audit, campaign/QR mechanics, CI run ID/URL, an explicit "Anon capture
→ attributed lead → staff notified → funnel stats: PASS/FAIL" line, and a DRAG READ. Then STOP and tell
me GRW-1 is ready for review.
```
