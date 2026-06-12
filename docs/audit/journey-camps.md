# Journey: E1 — Summer camps (create → publish → register → pay → run)

> **Auditor design, 2026-06-12.** Operator confirmed Proline IS selling summer camps now → E1 bumped to immediately after PT-1 (seasonal window: June–July sales, camps run in summer). Lean by construction: ~90% pattern reuse; the camp tables (`camps`, `camp_registrations`, `camp_attendance`) already exist in 000003 — the coder MUST verify real columns first (the AR/UX-1 phantom-column bug-class) and repair the surfaces against them, never against imagined schema.

## 1. What a camp is (vs the other products)
A **date-bounded program** (start–end date, daily sessions) with a **fixed price, capacity, and age range** — sold once per child, mostly to **guardians** (B3 makes this work: payer = guardian, household billing). Not recurring (≠ B2), not credit-based (≠ PT).

## 2. Origination (channel-complete)
- **A. Desk (primary):** parent walks in → staff register the kid (existing or new + guardian link, B3 origination) → invoice on the spot.
- **B. Portal/guardian:** guardian sees published camps → requests for a kid → staff approve → invoice (the B2/B3 request pattern, "Acting for" banner).
- **C. Landing (marketing):** camp cards (name, dates, age range, price, spots-left tease) via the `show_on_landing` pattern → CTA → trial/inquiry → lead (23R).

## 3. Lifecycle design (all house patterns)
1. **Create camp** — wizard (UX-1 conventions: steps, chips, no dropdowns): basics (names ar/en/fr, dates, age range) → capacity + price (USD/LBP) → review. `show_on_landing` toggle (ADM-1 pattern, default off → staff publish deliberately).
2. **Publish** — anon-read RLS for active+published camps of active gyms (000035/36 pattern; public catalog only).
3. **Register** — `register_camp` atomic RPC (house idiom): guards (active camp of gym, **capacity `FOR UPDATE`**, not already registered, age check → **warn, don't block** — staff override is the desk reality) → registration row → invoice via `issue_invoice` (**payer = guardian** per B3) → notification. Staff-direct from Member-360 ("Register to camp" contextual modal — FD-1 rule) and camp roster page; portal = request→approve through the same RPC.
4. **Pay** — D1 unchanged. **Deposits need NOTHING new:** D1's partial payments already model deposit-then-balance (invoice pending→partial→paid); the camp roster shows per-kid payment state so staff chase balances before day 1.
5. **Capacity full** — registration closes ("full" on landing/portal); **no waitlist in V1** (B2's waitlist machinery is for recurring classes; camps are short-window — staff keep an informal list via leads if needed). Flagged as the one scope call the operator may overrule.
6. **Run the camp** — per-day attendance on camp dates (reuse the attendance marking pattern, scoped to `camp_attendance`); roster with payment-state badges; **Today card docks during camp days** ("Camp today: N expected · M unpaid balances") via the FD-1 contract.
7. **Cancel/refund** — staff cancel a registration (archive pattern, reason); money handling stays human: the platform records (a credit/adjustment note on the invoice or a recorded negative adjustment is V2 — V1 = cancel + note; no refund processing per platform principle).

## 4. Edge cases
Kid registered for camp + regular classes (independent products — both fine); out-of-age registration (warn + staff confirm); camp dates overlapping class schedule (informational only — no conflict guard for V1); guardian with 2 kids in one camp (two registrations, one household bill view — B3 covers); price change after registrations exist (snapshot price on the registration row at RPC time — the PT-1 snapshot rule).

## 5. Slice plan
**One slice (E1)**, after PT-1: schema verification/repair of the three camp tables + anon-read policy + `register_camp` RPC (+ price snapshot column if missing) · camp wizard + list/detail/roster · Member-360 + portal/guardian flows · landing camp cards · per-day attendance · Today docking card. The e2e proof: desk-register a kid (guardian payer invoice) → portal shows it household-side → partial payment (deposit) → roster badge "partial" → camp-day attendance marked → capacity cap blocks the N+1th registration (atomic under race).
