# Go-Live Audit — Proline onboarding + white-label readiness (2026-07-02)

**Context.** Proline is a paying customer with a live, provisioned production tenant (slug `proline`, classes+PT). Owner asked for a full product audit ("fast dev + thin team — compensate") before (a) onboarding Proline properly and (b) building the white-label + unique-Proline landing. Four parallel deep audits ran against the working tree: **day-1 tenant readiness**, **core-flow bugs**, **landing/WL uniqueness**, **i18n/RTL/UX + security**. This document is the auditor's consolidated, corrected, prioritized synthesis. Full raw findings live in the audit transcripts; file:line evidence is preserved where load-bearing.

**Auditor corrections applied to the raw audits:**
- Two "not merged / does not exist" scares (WL-DOMAIN-ROUTING, `get_gym_slug_by_domain`) were **stale-local-ref artifacts** — the audits read the checked-out coder branch. Both ARE on `origin/main` and VF-applied to cloud (000073). Local `main` ref has been fast-forwarded.
- Audit 4's top "P0 — live-tenant owner compromise via public demo password": **downgraded.** The `@prolinegym.lb` demo accounts are RLS-bound to the DEMO gym (`proline-gym`), not Fakih's production tenant; tenant isolation was live-verified at provisioning. Public demo creds are by design for the sales showcase. **Real residue:** the login page still advertises `ProlineDemo2024!` as the password-field placeholder + hint on every tenant's login — remove (folded into GO-LIVE-GUARDS below).

**Confirmed healthy (verified, stop worrying):** record_payment (locking, overpay-guard), PT lifecycle (idempotent, expiry-safe), waitlist/capacity (atomic), refund/void paths, notifications-FK for login-less members, /invoices rebuild, i18n catalogs (2344 keys × 3 locales, zero missing), empty states across all owner surfaces, no-belt disciplines degrade gracefully, owner first-login flow, per-gym WhatsApp config, service-role strictly server-only, phone-login non-enumerable + rate-limited.

---

## P0 — fix BEFORE Fakih's day-1 (go-live blockers)

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| 1 | **Gym-settings editor is a dead stub** — default Settings tab shows "Save functionality is not active in MVP" to a paying customer; owner cannot edit name/phone/currency and cannot set logo/branding at all (000072 columns have no UI) | `gym-settings.tsx:266-270`; no gyms-update action exists | **SETTINGS-LIVE** slice: wire a staff-gated `saveGymSettings` server action; add logo upload (reuse avatar-upload pattern) + brand_color/hero/tagline/contact-socials fields |
| 2 | **Exchange-rate editor is a dead stub; no rate-insert path exists in the app.** Prod has 16 rates but latest is stale (2026-06-25); a Lebanese gym must keep USD⇄LBP current | `exchange-rates.tsx:141-145`; zero `exchange_rates` inserts in src/ | **SETTINGS-LIVE**: `insertExchangeRate` action + wire the form |
| 3 | **Leads status dropdown "phantom-converts"** — selecting Converted updates status only: no member, no invoice, funnel counts it | `leads-client.tsx:174-178,316-329` | **GO-LIVE-GUARDS**: remove `converted` from the interactive select; conversion only via ConvertModal |
| 4 | **Demo password advertised on every login page** (placeholder + hint render without `?demo=1`) | `auth/login/page.tsx:211,299` | **GO-LIVE-GUARDS**: neutral placeholder; demo hint only under `?demo=1` |
| 5 | **TVA 11% silently added on top of every configured price**; approval flows display pre-TVA | `000003:146`; `000005:178-179`; `000034:257` | **GO-LIVE-GUARDS**: per-gym `tax_rate` (gyms column), default per owner's answer (pending); show tax-inclusive total at approval |

## P1 — fix during onboarding week (client-visible warts / correctness)

- **DOUBLE-SHELL** — every staff dashboard page mounts twice (`(dashboard)/layout.tsx:47-64`): double fetch/poll, duplicate DOM ids, double offline-flush; portal/coach already fixed. Collapse to one responsive shell. *(Root cause of a whole anomaly family — biggest single quality win.)*
- **INVOICE-SEQ** — `generate_invoice_number` = COUNT(*)+1 race → raw 23505 on concurrent issue (`000005:206-211`). Per-gym sequence or advisory lock.
- **PORTAL-BALANCE** — portal home omits `partial` + doesn't net payments; contradicts billing tab (`portal/page.tsx:124-132`). Reuse `balanceUsd`.
- **STAFF-INVITE** — no UI to create receptionist/head_coach logins (`invite-button.tsx:16-20` hardcodes student|coach; `invite.ts:58`); coach invite dead-ends on missing phone (`invite.ts:67-69` vs optional phone in `coach-form.tsx:122`).
- **NO-MEMBERSHIP-GAPS** — membership surfaces still shown to a classes+PT gym: Settings plans link+tab, Money winback tab + renewals card, Today win-back card, students expiring chip, churn cols, desk badge (`settings/page.tsx:79`; `money/page.tsx:61,128`; `TodayHorizon.tsx:377`; `students/page.tsx:202`).
- **ERROR-SURFACES** — zero `error.tsx`/`not-found.tsx`/`global-error.tsx` in the app (raw Next 500s); raw Postgres `error.message` shown to users in ~10 spots. Branded localized boundaries + error mapping.
- **AUTH-HARDEN** — password policy min 6 / no requirements (`config.toml:182,185`) → raise; email login bypasses the middleware rate limiter (client → GoTrue direct, `login/page.tsx:109`).

## P1-WL — required before tenant #2 (not Proline-blocking; Proline's brand coincides with the hardcodes)

- **CATALOG-SCOPE** — anon SELECT policies expose EVERY gym's classes/schedules/plans+pricing (`000035:66-80`); replace with slug-parameterized definer RPCs.
- **WL-IDENTITY** — "PRO LINE" + `+961 70 628 601` baked into WhatsApp template footers (`whatsapp/types.ts:151-179`), dunning signature (`auto-dun.ts:39-48`), invite waMessage, `lib/seo.ts`, synthetic email domain. Source from the gym row.
- **PWA-IDENTITY** — `manifest.json` name/icons/theme, `offline.html` title, root favicon = PRO LINE for every installed tenant. Dynamic per-gym manifest.
- **SEO-PER-GYM** — landing metadata/OG/JSON-LD always Proline (`(marketing)/layout.tsx:22-89` ignores resolved gym).

## Landing tracks (the owner's stated goal)

**Key insight: Proline's "unique landing" and the WL template are the same code today — the default fallback IS Proline.** Their photos/story/contact are code constants, so (a) Proline can't edit their own page and (b) tenant #2 would inherit Proline's identity. One track fixes both:

1. **PROLINE-LANDING-DATA (P0 of this track):** seed Proline's brand rows (color/hero/tagline/logo); move contact+socials (WhatsApp/IG/phone/email/address/map) to public gym columns; brand Nav + Footer + Facility + hero-CTAs from the resolved gym (only Hero is branded today — `LandingNav.tsx:50,64`, `LandingFooter.tsx:25-116`, `FacilitySection.tsx:25-97`, `HeroSection.tsx:145-167`).
2. **LANDING-CONTENT (M):** champions/gallery/affiliations per-gym (storage-backed, null-safe like coaches); optional testimonials section (absent today).
3. **SEO-PER-GYM (M):** `generateMetadata` + JSON-LD resolve the gym.
4. **VENDOR-LANDING (M):** a Gym 360 product marketing page — does not exist; vendor origin currently serves Proline's page. Needs the routing decision (vendor origin → vendor page; custom domain → that gym; `?gym=` → that gym).

## P2 backlog (post-onboarding polish)

RTL sweep (~101 unguarded `mr-/ml-` icon gaps violating `docs/design-system.md:44`; 58 unflipped chevrons; `icon-rtl-flip` unused; `<bdi>` on mixed currency) · zod messages hardcoded EN (localized errorMap) · invoices module inline `t(en,ar)` bypasses catalog, FR falls to EN · bare `toLocaleString()` (~10 spots) · `overdue` status never written (badge dead) · first-month registration non-payment never suspends (`000047:262-277`) · funnel undercounts no-show trials (`funnel.ts:10`) · QR scanner dead code + dep · HSTS + `frame-ancestors` absent · `enabled_products.camp/class/pt` gates unimplemented (only membership) · defense-in-depth gym filters (`classes/page.tsx:94`) · daily tally counts future payments (`daily-tally.ts:19`) · avatars bucket world-readable (accept or signed URLs) · non-localized `confirm()` (`ClassDetail.tsx:80`) · rentals list no re-sync.

## Sequencing (lanes)

1. **In flight:** Lane A WL-ONBOARDING-WIZARD · Lane B ON1-RESILIENCE.
2. **Next:** Lane A → **SETTINGS-LIVE** (P0 #1+#2 cluster) · Lane B → **GO-LIVE-GUARDS** (P0 #3+#4+#5; needs the owner's TVA answer).
3. Then: **DOUBLE-SHELL** · **PROLINE-LANDING-DATA** · **NO-MEMBERSHIP-GAPS** + **ERROR-SURFACES** · **STAFF-INVITE** + **INVOICE-SEQ** + **PORTAL-BALANCE** + **AUTH-HARDEN**.
4. WL track before tenant #2: CATALOG-SCOPE · WL-IDENTITY · PWA-IDENTITY · SEO-PER-GYM · VENDOR-LANDING.
5. P2 backlog rolls behind.

**Open owner decisions:** (1) TVA — are configured prices tax-inclusive (bill as-is, default 0) or add 11% on top? (2) Vendor-landing copy/positioning when we get there.
