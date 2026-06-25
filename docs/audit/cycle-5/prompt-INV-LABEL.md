# CODER PROMPT INV-LABEL — surface the invoice type + description on every invoice surface (frontend-only)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-inv-label` off `main`. **Frontend-only display slice — NO backend/migration/RLS change.** **Benchmark gap (V1 "Get paid" clarity):** members and staff can't tell what an invoice is *for* — the backend already labels every charge, but the UI throws that away, so invoices read as anonymous amounts. Roadmap: this is leaf-surface polish on the billing path ([[strangle-validated-leaf-rot]]) that makes the monetization model legible ([[proline-monetization-model]]: gym membership · recurring class · PT package · camp).

## Why (root-caused via recon — the data is already there)
Every product's invoice is **already** auto-labeled at issue time: `invoice_type` (enum: `membership | class_registration | pt_package | pt_session | camp | rental | event | other`) **and** localized free-text `notes_en/notes_ar/notes_fr` (e.g. `Class: {name}`, `PT package: {name}`, `Membership: {name}`, `Camp: {name}`) are written by the issuing RPCs (`issue_invoice` 000031; class 000034; PT 000041; camp 000043). **The frontend just never renders them** — both invoice surfaces fetch `invoice_type` and drop it.

## Build — render the label + description everywhere an invoice line appears (frontend only)
1. **A localized type label.** Add a small mapping from `invoice_type` → an i18n key, with strings in `ar` / `en` / `fr` (match the existing i18n files + RTL). Examples: `membership`→"Membership", `class_registration`→"Class", `pt_package`→"PT Package", `pt_session`→"PT Session", `camp`→"Camp", `rental`→"Rental", `event`→"Event", `other`→"Other". Render it as a small **badge/pill** on each invoice line.
2. **Show the descriptive note.** Render the locale-appropriate `notes_{locale}` (the human text like "Class: Muay Thai Beginner") as the invoice line's description. Fetch `notes_en/ar/fr` in the queries that don't already select them.
3. **Apply to ALL invoice surfaces:**
   - **Dashboard list** — [`src/app/[locale]/(dashboard)/invoices/invoices-view.tsx`](src/app/[locale]/(dashboard)/invoices/invoices-view.tsx) (~:31–169): `invoice_type` is fetched but not shown — add a type badge + description column/cell.
   - **Portal billing** — [`src/app/[locale]/portal/billing/page.tsx`](src/app/[locale]/portal/billing/page.tsx) (~:43, :69–185): `invoice_type` is fetched (line ~43) but unused — render the badge + note per invoice.
   - **Receipt detail** — locate the receipt route (linked as `/${locale}/invoices/${id}/receipt`, likely `src/app/[locale]/invoices/[id]/receipt/page.tsx`); show the type label + full note there too.
4. **Localization:** correct in `/ar` (RTL), `/en`, `/fr`; no hard-coded English. Fall back gracefully if a `notes_{locale}` is null (show the type label alone).

## Out of scope
- **No backend/RPC/migration/RLS change** — do not touch how invoices are issued or what notes are written (enriching the notes themselves, e.g. PT session counts, is a separate later slice).
- Billing logic, dual-currency math, the invoice list's existing columns/filters/pagination — leave as-is; this is additive display only.
- The class-cycle badge ([3]/CYCLE-VIZ) and the landing classes bug ([6]) — separate slices.

## Verify
1. On **dashboard invoices** + **portal billing** + **receipt**, every invoice line shows the **type badge** + its **description note**; a class invoice reads "Class · Class: {name}", a PT one "PT Package · PT package: {name}", etc.
2. Correct + localized in `/ar` (RTL), `/en`, `/fr`; null-note rows still show the type badge.
3. **No data/RLS/billing change**; existing columns + totals unchanged; no regression on the invoices list or portal billing.
4. **Validate with a TARGETED e2e run** (E2E-TIERED is live): `gh workflow run e2e.yml --ref prompt-inv-label -f projects="<the billing + portal-billing projects>"` — do **not** burn a full ~45-min slot. Add/extend an assertion that an invoice line renders its type label (don't just snapshot).

## Acceptance
1. Invoice type badge + localized description render on dashboard invoices, portal billing, and the receipt; `/ar` `/en` `/fr` correct; null-safe; no backend/RLS/billing change; green on a **targeted** e2e run (run ID/URL).

## Hygiene
Branch `prompt-inv-label` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; never touch RLS/billing logic; **validate with a TARGETED run, not the full suite** (cost); **DO NOT merge** — report **"INV-LABEL ready"** + the targeted run ID; the auditor merges (and will **time the merge for after ISO-DB lands** so the union gate runs on the faster CI).

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / INV-LABEL — surface invoice type + description`: the gap (labels generated but never rendered), the surfaces touched, the i18n label map, the targeted run ID, an explicit **"invoice type + description shown on dashboard/portal/receipt; /ar /en /fr; no backend/RLS/billing change: PASS/FAIL"** line, and a DRAG READ (members/staff can finally read what each charge is for).
