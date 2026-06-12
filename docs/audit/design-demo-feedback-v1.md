# Demo feedback disposition — Proline owners' session (2026-06-13)

> Operator demoed to Proline ownership: positive on simplicity + logic. Seven feedback threads dispositioned below; forks locked with the operator same day. **Sales thesis: the remaining slices ARE the buying criteria** — each one below maps to something the owners explicitly asked for.

## Disposition

### 1. "Week and month views like Today" → FIN-1 (locked: action horizons)
Today gains a **Today / This Week / This Month** switcher over the same ActionCard stack: renewals due in horizon, expirings, camps running, trials booked, projected collections. Same "what needs action" logic, wider lens — built on the FD-1 card framework.

### 2. Finances + churn + win-back → FIN-1 (locked: owner dashboard, no accounting module)
Money gains the **owner's view**: monthly revenue by product (memberships/classes/PT/camps), collections by method, outstanding aging (current/30/60), **churn view** (lapsed/cancelled per month — ML-1's states make this a read), and the **WIN-BACK queue**: dropped members become a follow-up pipeline like prospects (call → log outcome → re-engage → reactivation = ML-1 reinstate/new sale). No exports/ledgers in V1.

### 3. Account creation + external share + onboarding → ON-1 (scope elevated, already queued)
Confirmed by the client almost verbatim as designed: staff create accounts for members AND team → **share initial credentials externally from the app** (WhatsApp share-sheet message with login + temp password) → forced password change at first login → **designed onboarding/orientation** (per-role first-login wizard: language, photo, key-features tour). The Option-B identity spike already proved the mechanism.

### 4. Marketing/growth → GRW-1 (locked: capture + sources + funnel + tracked links/QR)
Pulled back from the V2 cut by explicit client demand, lean: landing **"Book a free trial" capture form** (name+phone+interest → straight into Prospects + staff notification); **lead source** on every lead (Instagram/walk-in/referral/website/campaign); Prospects gains **funnel counts + conversion by source**; **tracked links/QR per campaign** (gym posts an IG ad with its own link; the platform shows what it produced). Strong white-label differentiator.

### 5. Guardian/family — clarity, not code (answer for the client)
Mother with a 7- and 8-year-old: **staff create three PROFILES** (mother as guardian + two kids) — **only the mother gets an ACCOUNT** (one login; kids are login-less by design and never need accounts). She sees both kids via the kid-switcher. **Billing:** each kid's registration generates exactly ONE invoice — the kid is the recipient, the mother is the payer; her household view *aggregates the same invoices by reference*, so nothing is ever double-counted, and one desk payment settles each invoice once. (B3 built this; ON-1 adds her login; nothing new to build.)

### 6. Layout/design "could be improved" → AX-1 (locked: targeted elevation)
One slice elevates the 6–8 most-seen surfaces (landing, Today, Member-360, portal home, schedule, money): typography scale, spacing rhythm, card hierarchy, empty states — anchored by a **mini design-system note** so later slices stay consistent. Includes per-shell identity accents (ex-FRX).

### 7. Arabic not fully active + poor font → AX-1, priority #1 (the Arabic-first promise)
Full Arabic fidelity sweep: kill every `isRTL ? ar : en` bypass (I18N-1's list), activate ar on every page (audit + fix missing actives), RTL correctness pass, and a **proper Arabic webfont** (IBM Plex Sans Arabic / Cairo class, via next/font with correct fallbacks + no CLS). The ar e2e smoke extends to every shell. An Arabic-first product that renders broken Arabic is unsellable in this market — this leads the slice.

## Updated queue (post-UX-2)
**UX-2** *(in flight)* → **AX-1** (Arabic fidelity + design elevation + shell accents; absorbs FRX) → **FIN-1** (horizons + owner finances + churn/win-back) → **GRW-1** (capture + sources + funnel + tracked links/QR) → **ON-1** (invites + external share + onboarding, elevated scope) → **G1 WhatsApp** → **F3-lean** → **G2-lean** → **V1 readiness review** (now also: demo script + pristine demo dataset for the sales close) → **deploy**.

Honest cost: ~3 added/expanded coder cycles vs the prior queue — paid for by the fact that every one is a stated buying criterion from the first real customer.
