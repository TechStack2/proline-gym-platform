# Execution Plan — Proline go-live + white-label (from the 2026-07-02 audit)

**Source:** [go-live-audit-2026-07.md](go-live-audit-2026-07.md). **Owner decisions baked in:** prices are FINAL/tax-inclusive (TVA not added on top; Proline tax_rate=0) · clean tenant + demo stays sales showcase · both data paths (Excel import + in-app entry) · dunning scheduler parked (hopper).
**Cadence basis:** each slice ≈ one lane-turn (build+validate ≈ half-day at current pace); 2 lanes run in parallel; auditor merges/VFs continuously. Phases gate on owner approval, not calendar.

---

## Phase 1 — GO-LIVE BLOCKERS (the 5 P0s) — 2 slices, both lanes, ~1 day
> Gate to enter: none (pre-approved "button up" scope). Gate to exit: P0s merged + VF'd + auditor sets Proline tax_rate=0 + smoke-check on prod.

- **SETTINGS-LIVE** (Lane A): wire the dead gym-settings editor (profile/contact fields + 000072 branding fields + logo upload + hex-validated brand color; remove the "not active in MVP" note) + the dead exchange-rate form (staff-gated definer RPC insert). Pre-approved narrow RLS: owner-only UPDATE-own-gym policy if missing (auditor reviews). Migration 000075 if storage/policy needed.
- **GO-LIVE-GUARDS** (Lane B): (1) leads dropdown — remove interactive `converted` (ConvertModal is the only conversion path); (2) login page — neutral password placeholder, demo hint only under `?demo=1`; (3) TVA — migration 000074 `gyms.tax_rate NUMERIC(5,2) NOT NULL DEFAULT 11.00` (preserves demo/e2e behavior), issuance RPCs read the gym's rate (diff against CURRENT live bodies — reversion pitfall), approval flows display the tax-inclusive total; new spec proves a 0-TVA gym bills exactly the configured price. **Auditor post-VF: set Proline tax_rate=0 on prod.**

## Phase 2 — ONBOARDING WEEK (P1 correctness + Fakih setup) — ~6 slices + auditor ops
> Gate: owner approves after Phase 1. Owner inputs needed: **member Excel**; Fakih walkthrough scheduling.

Slices (rough lane order; pairs chosen to avoid file collisions):
1. **DOUBLE-SHELL** — collapse the staff dashboard to one responsive shell (kills double-fetch/dup-IDs/double-flush family). Biggest quality win; touches many pages — runs alone on a lane.
2. **STAFF-INVITE** — receptionist/head_coach invite UI + phone-required-to-invite UX.
3. **PORTAL-BALANCE** — portal home reuses the billing computation (partial + netting).
4. **INVOICE-SEQ** — per-gym invoice-number sequence/advisory lock (kills the 23505 race).
5. **NO-MEMBERSHIP-GAPS** — gate remaining membership surfaces (Settings plans tab/link, Money winback+renewals, Today win-back, students chip, churn cols, desk badge).
6. **ERROR-SURFACES + AUTH-HARDEN** — global/segment error.tsx + not-found (branded, localized); map raw error.message → localized; password policy ≥10; email login through a rate-limited server action.

Auditor ops in parallel: **Excel import** (one-time script → students/profiles/guardians on Proline), verify with Fakih's team; walkthrough using the demo script adapted to classes+PT.

## Phase 3 — PROLINE'S LANDING ("theirs") + domain — ~4 slices + infra
> Gate: owner approves + provides **branding assets** (logo file, hero/gallery/champion photos, story/tagline text, IG/WhatsApp handles, address confirmation) + **domain choice** (prolinegym.me vs subdomain).

1. **PROLINE-LANDING-DATA** — contact/socials to public gym columns; Nav + Footer + Facility + hero-CTAs render from the resolved gym (only Hero does today); seed Proline's brand rows (their identity becomes THEIR data, not the code fallback).
2. **LANDING-CONTENT** — champions/gallery/affiliations per-gym (storage-backed, null-safe); optional testimonials section.
3. **SEO-PER-GYM** — generateMetadata + JSON-LD + OG resolve the gym.
4. **PWA-IDENTITY** — dynamic per-gym manifest/offline title/icons (installed app says the gym's name).
- Infra (owner+auditor, ~1h): Cloudflare-for-SaaS (free ≤100 hostnames) or subdomain; Railway domain; insert `gym_domains` row → prolinegym.me renders Proline's branded landing.

## Phase 4 — WHITE-LABEL READY (sell tenant #2) — ~4 slices
> Gate: owner approves; Proline live + stable.

1. **CATALOG-SCOPE** — replace blanket anon SELECT policies with slug-parameterized definer RPCs (kills cross-tenant catalog/pricing enumeration).
2. **WL-IDENTITY** — WhatsApp template footers, dunning signature, invite message, synthetic-email domain, seo.ts constants → per-gym.
3. **VENDOR-LANDING** — the Gym 360 product marketing page (doesn't exist); routing: vendor origin → vendor page, custom domain → gym, ?gym= → gym.
4. **WL-ONBOARDING-WIZARD** — finish/land the in-app tenant-provisioning wizard (in flight or re-queued from Lane A).
- Hopper joins here: **SCHEDULER-WIRE** (dunning cron + owner's 2 secret steps).

## Phase 5 — POLISH BACKLOG (P2s, continuous behind phases)
RTL sweep (~101 physical-margin icon gaps, 58 unflipped chevrons, bdi on mixed currency) · zod messages localized · invoices module → i18n catalog (FR) · `overdue` status writer · first-month registration suspension gap · funnel counts trials from events · QR scanner: wire or delete · HSTS + frame-ancestors · enabled_products gates for camp/class/pt · locale-less toLocaleString sweep · defense-in-depth gym filters · daily-tally future-payment bound · avatars signed-URLs decision · GoTrue create-then-login propagation (product-side retry UX; e2e-hardened already).

---

## Owner asks by phase (the EA's consolidated list)
| Phase | You provide |
|---|---|
| 1 | Nothing — relay 2 lane prompts; I do the rest |
| 2 | Member Excel · a word on walkthrough timing with Fakih |
| 3 | Branding assets (logo/photos/story/handles) · domain choice |
| 4 | Vendor-landing copy/positioning input · dunning secrets (2 steps) when SCHEDULER-WIRE lands |

**Standing risks tracked:** shared-gym e2e flakes (hardened: ml1/off2/off4/on1) · function-rewrite reversion pitfall on RPC-touching migrations (auditor diff-checks every one) · migration-number collisions (auditor assigns: next free 000074=GO-LIVE-GUARDS, 000075=SETTINGS-LIVE if needed).
