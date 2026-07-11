# Proline Gym — Staff Demo Script (advanced V1)

**Goal:** show the gym owner/staff a complete, real, Arabic-first platform that replaces Excel + WhatsApp — running on the live demo. ~25–30 min.

**Live demo:** `https://proline-gym-production.up.railway.app` · **Password (all):** `ProlineDemo2024!`
**Accounts:** `owner@prolinegym.lb` (staff dashboard) · `coach@prolinegym.lb` (coach app) · `reception@prolinegym.lb` · `student@prolinegym.lb` (member portal — Karim) · `guardian@prolinegym.lb` (parent — Samer → kid Karim).

**Before the demo (auditor runs):** reseed the live demo to a pristine 360 dataset (`reseed_proline_demo()` RPC — anchors all dates to *today* so "today's classes / renewals this week" are live), and re-confirm all 5 logins + the 5 flows below. (Note: the demo data is dated-to-now after reseed.)

---

## The 5 flows (in order)

### 1 — Lead → Trial → Convert (≈4 min) · *the funnel*
`owner` → **Leads**: a prospect in the pipeline → schedule a trial → mark trialed → **Convert** → creates the student **and fires a WhatsApp welcome** (show it in the outbound log). New member appears in **Members**.
**Say:** "Every walk-in is captured, tracked, and converted — and the welcome goes out on WhatsApp automatically."

### 2 — Member self-service + approval + payment (≈6 min) · *Engage × Get-Paid × WhatsApp*
`student` (Karim) portal → **Request a class** (Muay Thai) → shows "requested". Switch to `owner` **Inbox** → **Approve** (optional discount) → an **invoice auto-issues** with the type label + monthly cycle. **Money** → record a cash payment → invoice "Paid". Back to the member portal → "Paid" + "Monthly · renews {date}".
**Say:** "Members self-serve, staff approve in one tap, billing is automatic and dual-currency (USD/LBP), and the member sees it all live."

### 3 — Membership lifecycle: renewal + freeze (≈5 min) · *Get-Paid depth*
`owner` → **Today → This Week** → "Renewals this week" surfaces a member ending soon → **Renew** → next-month invoice issued (carries the new plan price). Then open a member → **Freeze** 10 days → show the held value (end-date extended) + the **Today "Paused" card** + one-tap **Resume**.
**Say:** "Renewals and pauses are calculated — freeze holds the member's remaining value, and paused members surface on Today so nothing slips." *(Frame: reminders are one-tap today; scheduled auto-dunning is the next release.)*

### 4 — Guardian family portal (≈5 min) · *the martial-arts differentiator*
`guardian` (Samer) → **kid-switcher** → select Karim → request a class for him → `owner` approves → the invoice's **payer auto-resolves to the guardian** → **household billing** groups all kids. Member-360 on the kid shows "Payer: guardian".
**Say:** "Parents manage and pay for their kids in one account — household billing, waiver signing for minors, the whole family in one place. Most systems can't do this."

### 5 — Operate: attendance (+ offline) & waiver (≈5 min) · *trust + reliability*
`coach` app → **Attendance** → mark a class roster. Optional: go offline → mark → "N pending" → reconnect → syncs (no double-count). Then `student` portal → **sign the waiver** (canvas signature → stored artifact; re-sign on version bump).
**Say:** "Attendance works even with no internet — front-desk reality in Lebanon — and signed waivers are captured digitally, versioned."

---

## Differentiators to land (the "why us")
- **Arabic-first, true RTL** — flip to `/ar`, show the same screens fully Arabic (typography tuned for Arabic legibility). *(USP; the AR-TYPE polish lands pre-demo.)*
- **Real WhatsApp** (Cloud API, not links) — the channel the gym already lives on.
- **Dual-currency** (USD/LBP with rate) — built for Lebanon.
- **Offline-first** attendance + **installable PWA**.
- **Family/guardian** household billing — martial-arts-specific.

## Known limits — frame proactively (don't get caught)
- **Auto-dunning:** reminders/renewals are **one-tap now**; scheduled auto-chase is the next release (V1.1) — unless we ship DUNNING-AUTO first (auditor's open question to the owner).
- **Login-less members** don't receive in-app notifications until provisioned (the recommended flows use logged-in members, so this won't surface).
- **Offline** is transparent (no toggle) — mention it, don't dwell.

## Pre-demo checklist
- [ ] Reseed live demo (pristine, dated-to-today)
- [ ] AR-TYPE + held polish merged & deployed (Arabic typography, portal/coach shells, first-login password fix)
- [ ] All 5 logins verified (incl. guardian)
- [ ] Walk all 5 flows once on the live site
- [ ] `/ar` spot-check on the hero + one dashboard + one portal screen
