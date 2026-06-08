# Industry Benchmark — PRO LINE vs Best-in-Class Boutique / Martial-Arts Gym Platforms

> **Created:** 2026-06-08 · **Auditor:** Project Auditor (read-only)
> **Goal:** Score PRO LINE's four portals against the best boutique & martial-arts-specialty gym platforms, and identify where to **match** table-stakes and where to **leapfrog**.
> **Scope guardrail:** Four portals only — Marketing (landing), Student/Member, Coach, Admin (staff dashboard).
> **Method:** Capability model synthesized from the reference set below + verified against the Cycle-5 behavioral re-audit ([workflow-maturity-matrix.md](./workflow-maturity-matrix.md)).

---

## 1. Reference Set (who we benchmark against)

| Platform | Archetype | Relevance to PRO LINE |
|----------|-----------|------------------------|
| **Kicksite** | Martial-arts-native (TKD founders) | Belt/rank tracking, parent portals, inventory; **no native app** (mobile browser) — PRO LINE's PWA can match/beat |
| **Gymdesk** (ex-Martialytics) | Martial-arts-native (BJJ founder) | Self check-in, included website, **native iOS/Android app w/ booking + push**, rank tracking — the bar for member self-service |
| **Zen Planner** | MA + functional fitness | Robust automation, advanced reporting & financial mgmt — the bar for Admin |
| **Spark Membership** | MA, marketing-first | Lead-gen automation & nurture — the bar for CRM/growth |
| **Mariana Tek / ABC Glofox / Mindbody** | Boutique fitness (horizontal) | Branded member app, waitlist auto-promotion, intro-offer funnels, segmentation, dunning, churn/LTV analytics — the bar for engagement + analytics |
| **Wodify / PushPress** | CrossFit/functional | Performance tracking, leaderboards, member app engagement |

**Boutique table-stakes (validated):** branded member app with self-service booking, **waitlist that auto-promotes and notifies the next member**, automated reminders/confirmations/post-class follow-up, intro-offer lead funnels, segmented email/SMS/push journeys, dunning/failed-payment retry, churn/expiring-member/no-show/late-cancel reporting, e-sign agreements.

---

## 2. Capability Scoring Model

Each domain scored **0–5**: 0 = absent · 1 = stub · 2 = basic CRUD · 3 = functional workflow · 4 = at industry par · 5 = best-in-class / leapfrog. "Verdict" compares to the reference bar.

---

## 3. Portal A — Marketing / Landing (Acquisition)

**Best-in-class does:** intro-offer/trial funnels with a real booking calendar, **online membership purchase & account creation**, **e-sign waiver at signup**, embedded live schedule, social proof/reviews, referral program, promo codes, retargeting pixels, SEO.

| Capability | Best-in-class | PRO LINE now | Score | Verdict |
|------------|---------------|--------------|:--:|---------|
| Lead capture form | Multi-field, source-tagged, instant nurture | `submit_public_lead` RPC (name + phone only), no auto-follow-up | 2 | Behind |
| Intro-offer / trial funnel | Pick a date on a calendar, confirmed instantly | "Call/WhatsApp us to book" copy; no booking | 1 | Behind |
| Online signup & purchase | Self-serve account + membership purchase | None (no online signup) | 0 | Behind |
| E-sign waiver at signup | Standard | None (waiver is a placeholder) | 0 | Behind |
| Live schedule embed | Standard | Disciplines section only, no schedule | 1 | Behind |
| Social proof / reviews | Testimonials, Google reviews | None | 0 | Behind |
| Referral / promo codes | Standard growth lever | None | 0 | Behind |
| **Arabic-first RTL landing** | Rare in reference set | **Yes, native** | 5 | **Ahead (leapfrog)** |

**Portal A verdict: Behind** on conversion mechanics; **ahead** on localization. Biggest gap: there is no self-serve funnel from "interested" → "booked trial" → "member." Today every conversion requires manual staff entry.

---

## 4. Portal B — Student / Member (Engagement & Retention — the biggest gap)

**Best-in-class does:** branded app/PWA with **self-service class booking + waitlist + policy-bound cancel**, **household/family management** (one parent managing multiple kids — essential for martial arts), member-visible **progress** (belt/skill/attendance streaks), push notifications & reminders, book PT, buy/track session packs, freeze/upgrade membership, payment-on-file/autopay, in-app coach messaging, curriculum/video library, challenges/leaderboards, digital belt certificates, event/seminar registration.

| Capability | Best-in-class | PRO LINE now | Score | Verdict |
|------------|---------------|--------------|:--:|---------|
| Self-service class booking | Core of the app | **None — portal is 100% read-only** | 0 | Behind |
| Waitlist + auto-promotion | Standard, automated | None | 0 | Behind |
| Cancel within policy | Standard | None | 0 | Behind |
| Family / household management | Table-stakes for MA (Kicksite/Gymdesk) | Parent role exists in DB; **no UI to manage multiple children** | 1 | Behind |
| Member-visible progress (belt/skill) | App-front-and-center | Belts are **admin-only**; student can't see rank/history | 1 | Behind |
| Attendance streaks / gamification | Wodify/PushPress staple | None | 0 | Behind |
| PT booking / pack visibility | Standard | None (PT is admin-assigned, invisible to member) | 0 | Behind |
| Push notifications & reminders | Core retention lever | PWA prompt exists; **no push, notifications write-never** | 1 | Behind |
| In-app coach messaging | Common | None | 0 | Behind |
| Curriculum / video library | Gymdesk, Kicksite | None | 0 | Behind |
| Membership freeze / upgrade | Standard | View-only status | 1 | Behind |
| Billing visibility | Standard | **Yes — invoices/payments view** | 3 | At Par |
| **Offline-first attendance/PWA** | Rare | Architected (Dexie spec, offline page) — not wired | 2 | Ahead-potential |
| **Arabic-first member UX** | Rare | Native | 5 | **Ahead (leapfrog)** |

**Portal B verdict: Far Behind.** This is the platform's largest competitive gap. The member portal is a read-only dashboard; the industry's member portal is the retention engine. **Family management + self-booking + visible progress are the three must-haves** to be credible in martial arts.

---

## 5. Portal C — Coach (Delivery & Enablement)

**Best-in-class does:** today's roster + fast check-in, **PT session logging that decrements packs**, sub/cover management, availability, **student skill assessments + progress notes**, curriculum/lesson plans, attendance trends, commission/payroll visibility, message students/parents, assign homework.

| Capability | Best-in-class | PRO LINE now | Score | Verdict |
|------------|---------------|--------------|:--:|---------|
| Daily roster + attendance check-in | Core | **Yes — robust, Zod-validated, marked_by** | 4 | **At Par** |
| PT session logging → pack decrement | Standard | `increment_sessions_used()` exists but **never called**; no UI | 0 | Behind |
| Coach sees assigned PT students | Standard | **Coach portal never reads `pt_assignments`** | 0 | Behind |
| Skill assessments / progress notes | MA staple | None (belt promotion is admin-side) | 1 | Behind |
| Curriculum / lesson plans | Gymdesk/Kicksite | None | 0 | Behind |
| Sub / cover management | Standard | None | 0 | Behind |
| Message students/parents | Common | None | 0 | Behind |
| Commission / payroll visibility | Zen Planner | None | 0 | Behind |
| Attendance trends for coach | Standard | None (data exists, no view) | 1 | Behind |

**Portal C verdict: Behind, with a strong core.** Attendance check-in is genuinely at-par — the best-built flow in the platform. But the coach has no PT roster, no way to log/decrement sessions, no progress/assessment tools, and no messaging. The coach is currently a passive attendance-taker, not an engaged instructor.

---

## 6. Portal D — Admin / Staff (Operations & Growth Engine)

**Best-in-class does:** CRM with **automated lead nurture / intro-offer conversion**, segmented **email/SMS/push journeys**, recurring billing with **dunning/failed-payment retry**, freezes/proration, **analytics (MRR, LTV, churn, retention cohorts, expiring members, no-shows, late cancels, unsigned agreements, trainer performance)**, staff payroll/commissions, e-sign agreements, POS/inventory/pro-shop, multi-location, **workflow/automation builder**, reputation/review building.

| Capability | Best-in-class | PRO LINE now | Score | Verdict |
|------------|---------------|--------------|:--:|---------|
| Core CRUD (students/classes/coaches/etc.) | Standard | **Strong — 9 modules, full CRUD** | 4 | At Par |
| Lead pipeline | Visual + automated nurture | Status board; **convert is cosmetic**, no nurture | 2 | Behind |
| Automated comms (email/SMS/WhatsApp drip) | Core growth lever | **None — notifications write-never**; WA client stub only | 0 | Behind |
| Billing (record + dual-currency) | Standard | **Strong dual-currency invoices/payments** | 4 | **At Par / Ahead** |
| Dunning / overdue reminders | Standard (auto-retry) | **None** (no overdue reminder); cash model = reminder-based | 1 | Behind |
| Membership renewal / expiry automation | Standard | **None** — `auto_renew` column unused | 1 | Behind |
| Analytics (MRR/LTV/churn/retention) | Core for retention | 3 basic reports (attendance/belts/revenue); no churn/LTV | 2 | Behind |
| Operational alerts (no-show/late-cancel/expiring) | Standard | None | 0 | Behind |
| E-sign waivers / agreements | Standard | Placeholder only | 0 | Behind |
| Staff commissions / payroll | Zen Planner | None | 0 | Behind |
| POS / pro-shop / inventory | Kicksite, Zen Planner | None | 0 | Behind |
| Belt/rank engine | MA-specific | **Strong — atomic, rank-ordered, history, stepper** | 4 | **At Par** |
| Workflow / automation builder | Mariana Tek/Glofox | None | 0 | Behind |
| **Dual-currency (USD/LBP + exchange)** | Essentially none | **Native, first-class** | 5 | **Ahead (leapfrog)** |
| **Offline-tolerant operations** | Rare | Architected, not wired | 2 | Ahead-potential |

**Portal D verdict: Strong operational core, no growth engine.** PRO LINE's CRUD, billing, and belt engine are at-par or better. What's missing is everything that *retains and grows*: automated communications, nurture, renewal/dunning, and retention analytics. The dead notification layer is the root blocker.

---

## 7. Overall Scorecard

| Portal | Avg Score (0–5) | Verdict | Headline gap |
|--------|:--:|---------|--------------|
| A — Marketing | ~1.1 | Behind | No self-serve trial→signup funnel |
| B — Student/Member | ~1.2 | **Far Behind** | Read-only; no booking, family mgmt, or visible progress |
| C — Coach | ~1.2 | Behind (strong core) | No PT roster/logging, assessments, or messaging |
| D — Admin | ~2.3 | Mixed | Great core, **no growth engine** (comms/nurture/analytics) |

**Leapfrog assets (already ahead of the field):** Arabic-first RTL UX, native dual-currency, and an offline-first architecture. Most global platforms (Mindbody, Glofox, Zen Planner, Kicksite) do **none** of these well. These are PRO LINE's durable differentiators for the MENA / Lebanon boutique market — worth finishing and marketing, not just maintaining.

---

## 8. Localization Caveat — "Autopay" → "Reminder + Reconcile"

Reference platforms lean on card-on-file autopay and dunning (auto-retry). PRO LINE is **cash/OMT/Whish by design** (no card processing — [CLAUDE.md](../../CLAUDE.md) decision #5). So the industry "autopay + dunning" best practice **translates** here to: proactive **payment-due reminders** (WhatsApp/SMS), **expiry/renewal nudges**, **cash reconciliation views**, and **reference tracking** — not Stripe retries. The retention *outcome* is the same; the *mechanism* is messaging, which makes the dead notification layer doubly critical.

---

## 9. What "Match or Exceed Best-in-Class" Means Here

1. **Match table-stakes** that the platform lacks: member self-booking + waitlist, family management, visible progress, automated comms, nurture/renewal, retention analytics, e-sign waivers, coach PT/assessment tools, marketing funnel.
2. **Exceed** in the three leapfrog lanes the field ignores: **Arabic-first**, **dual-currency**, **offline + WhatsApp-native engagement** (WhatsApp is the dominant channel in Lebanon — a WhatsApp-native member experience would beat the email/SMS-centric incumbents in this market).

→ Phased delivery plan: [`platform-elevation-roadmap.md`](./platform-elevation-roadmap.md)

---

### Sources

- [Wodify — Kicksite alternatives/competitors](https://www.wodify.com/blog/kicksite-alternatives-competitors)
- [Zen Planner — top martial arts software compared](https://zenplanner.com/blogs/the-top-5-martial-arts-management-software-solutions-compared/)
- [Zen Planner vs Kicksite 2025](https://zenplanner.com/comparison-blog/which-martial-arts-crm-wins-in-2025-zen-planner-vs-kicksite/)
- [Gymdesk — best gym management software](https://gymdesk.com/blog/best-gym-management-software)
- [Glofox — fitness class booking app features](https://www.glofox.com/blog/fitness-class-booking-app/)
- [Mariana Tek vs Mindbody](https://www.marianatek.com/mariana-tek-vs-mindbody/)
- [Glofox — Gym CRM](https://www.glofox.com/blog/gym-crm/)
