# V1 Market-Readiness Scope — Executed vs Remaining, and the No-Fluff Line

> **Created:** 2026-06-10 · **Auditor:** Project Auditor (read-only) · **Purpose:** lock what "well-rounded, market-ready V1, no fluff" means for **PRO LINE (one martial-arts gym, Hadath, Lebanon, replacing Excel + WhatsApp)** — by reconciling the **benchmark table-stakes** ([industry-benchmark.md](./industry-benchmark.md)) + the **client blueprint MVP** ([../../CLAUDE.md](../../CLAUDE.md)) + the **journey catalog** ([journey-catalog.md](./journey-catalog.md)) into one **coverage matrix**, a **V1 must-have line**, and explicit **deferrals/cuts**.
> **Why now:** we executed the foundation + Phase-1 connective tissue deeply, but never drew the line between *well-rounded V1* and *fluff*. This is that line.

---

## 0. The design model (so "unmapped" isn't mistaken for "unplanned")
We deep-map **one journey per slice, just-in-time** (design doc → coder prompt → behavior-green → merge), not all upfront — that keeps scope honest and lets each slice learn from the last. The catalog is **breadth** (every journey named + scoped); deep design is **JIT**. This doc adds the missing third thing: the **V1 scope lock** that says which catalog journeys are *required* for market-ready, which are *V2*, and which are *fluff to cut*.

## 1. Coverage matrix — did we execute on the analysis? what remains?

**Status:** ✅ executed/merged · 🔵 in flight · 📐 designed · ⚪ catalog-stub (not deep-mapped) · ❌ absent.
**V1 verdict:** **MUST** (well-rounded launch) · **V1.1** (fast-follow) · **V2** (post-launch growth) · **CUT** (fluff for this client).

### Operate — run the gym day-to-day
| Capability | Benchmark | Status | V1 |
|---|---|:--:|:--:|
| Attendance check-in | 4/5 at-par | ✅ B1 | MUST ✓ |
| Belt/rank engine + promotion | 4/5 at-par | ✅ B1 (atomic) | MUST ✓ |
| Lead → trial → convert → onboard | 2→3 | ✅ A1 | MUST ✓ |
| PT lifecycle (request→approve→bill→deliver→consume) | 0→3 | ✅ 22-R + C1 | MUST ✓ |
| Core CRUD + scheduling | 4/5 | ⚠️ exists but **admin UI DOA** (classes list/detail/enroll, students search) | **MUST — repair** |

### Get paid — billing (cash/OMT/Whish)
| Capability | Benchmark | Status | V1 |
|---|---|:--:|:--:|
| Dual-currency invoice + record→reconcile + receipt | 4/5 record, 1/5 reconcile | 🔵 D1 | MUST ✓ (closing) |
| Renewal + overdue **reminders** (cash-model dunning) | 1/5 | ❌ D3 | **MUST** (retention lever for a cash gym) |
| Account-credit / overpayment banking | — | blocked by design | **CUT** |
| Analytics (MRR/LTV/churn/cohorts/heatmaps) | 2/5 | ❌ | **V2** |
| Commissions/payroll · POS/pro-shop/inventory | 0/5 | ❌ | **V2 / CUT** |

### Engage — the member portal (benchmark's biggest gap, ~1.2/5)
| Capability | Benchmark | Status | V1 |
|---|---|:--:|:--:|
| Member-visible progress (rank/history/streak/eligibility) | 1→3 | ✅ B1 | MUST ✓ |
| Billing visibility | 3/5 | ✅ | MUST ✓ |
| **Self-service booking + cancel + waitlist auto-promote** | 0/5 | ❌ B2 | **MUST** (marquee gap) |
| **Family / household (parent → multiple children)** | 1/5 | ❌ B3 | **MUST** (MA must-have — kids) |
| Membership freeze / upgrade | 1/5 | ❌ D2 | **V1.1** |
| Curriculum / video library · gamification (streaks/badges/certs) | 0/5 | ❌ | **V2** |

### Reach — comms (WhatsApp is the channel in Lebanon)
| Capability | Benchmark | Status | V1 |
|---|---|:--:|:--:|
| In-app notification producers + bell | 1→3 | ✅ 21/F2 | MUST ✓ |
| **Notifications reach login-less members** (`user_id` FK fix) | — | ❌ **broken** | **MUST** (else comms never reach real members) |
| **WhatsApp delivery** of confirmations/reminders | 0/5 (WA stub) | ❌ G1/6A | **MUST** (in-app alone can't reach login-less members) |
| Push (PWA) | 1/5 | ❌ | **V1.1** |
| Automated nurture / drip journeys | 0/5 | ❌ F1 | **V2** (growth, not core ops) |
| Coach ↔ member/parent messaging | 0/5 | ❌ C4 | **V2** |

### Acquire — marketing funnel (Portal A)
| Capability | Benchmark | Status | V1 |
|---|---|:--:|:--:|
| Lead capture (landing form, source-tagged) | 2→3 | ✅ A1 | MUST ✓ |
| Self-serve trial booking · online signup + purchase | 1/5, 0/5 | ❌ A2/5A | **V2** (staff-run gym; staff convert suffices for launch) |
| Referral / promo codes · social proof / reviews / SEO | 0/5 | ❌ A3 | **V2** |
| E-sign waiver at signup + on file | 0/5 | ❌ F3 | **V1.1** (launch on paper, digitize fast) |

### Programs — revenue lines (in the client blueprint)
| Capability | Status | V1 |
|---|:--:|:--:|
| Summer **camps** (publish → register → invoice → attend) | ❌ E1 | **V1** (seasonal revenue; client blueprint) |
| Coach / space **rentals** (list → book → invoice) | ❌ E2 | **V1.1** (client blueprint; lower frequency) |

### Differentiate — the leapfrog lanes (intentional, NOT fluff)
| Lane | Status | V1 |
|---|:--:|:--:|
| Arabic-first RTL | ✅ 5/5 (held every slice) | MUST ✓ |
| Dual-currency (USD/LBP) | ✅ 5/5 | MUST ✓ |
| **Offline-first** (attendance/payments work with no internet) | ⚪ architected, not wired (G2) | **V1.1** (client's stated key decision; hard — wire after the engagement core) |
| WhatsApp-native engagement | ❌ (see Reach) | **MUST** (the channel) |

---

## 2. The V1 must-have line (recommended — lean & well-rounded for ONE Lebanese MA gym)

A credible launch = **operate the gym + engage members + get reliably paid + reach members where they are (WhatsApp)** — with the two leapfrog lanes already won (Arabic, dual-currency). Concretely, V1 = everything ✅ above **plus** this finite remaining set:

1. **D1 Billing** (closing now) → close Phase 1.
2. **Notification-FK fix** — so member comms can actually land (small foundation slice).
3. **Admin-UI repairs** — classes list/detail/enroll + students search (the DOA cluster; the gym can't operate without these).
4. **B2 Self-service booking + waitlist** — the #1 member-engagement gap.
5. **B3 Family / household** — kids/parents; non-negotiable for martial arts.
6. **D3 Renewal + overdue reminders** (cash-model) — the retention mechanism.
7. **G1 WhatsApp delivery** — confirmations/reminders/receipts over WhatsApp (wraps the producers we built).
8. **E1 Camps** — seasonal revenue line (client blueprint).

**V1.1 fast-follow:** membership freeze/upgrade (D2), e-sign waiver (F3), rentals (E2), PWA push, **offline-first finish (G2)**.

**V2 (post-launch growth):** self-serve signup/purchase + trial booking + referrals/SEO (A2/A3/5A), nurture automation (F1), retention analytics, coach assessments/curriculum/messaging/subs (B4/C2/C3/C4), gamification, video library.

## 3. Explicit fluff cuts (so they don't creep into V1)
**CUT for this client / launch:** account-credit balances · commissions/payroll · POS/pro-shop/inventory · multi-location · advanced analytics dashboards · curriculum video library · gamification/leaderboards · automated nurture drip · in-app messaging. None are needed for one gym to run, engage, and get paid; several are genuine boutique-chain features that would be *fluff* here. They're parked in V2, not built speculatively.

## 4. Remaining execution roadmap to V1 (JIT-designed, in order)
`D1 (closing)` → **Phase-1 exit re-score** → `FK-fix` → `admin-UI repairs` → `B2 booking+waitlist` → `B3 family` → `D3 renewal/dunning reminders` → `G1 WhatsApp delivery` → `E1 camps` → **V1 readiness review** (re-score all portals; deploy). Then V1.1 (D2, F3, E2, push, **G2 offline**).

Each is deep-designed just-in-time (origination-first, error-recovery + edge cases, behavior-green) the slice before it's built, on the now-deterministic suite.

## 5. Open decision — confirm the V1 bar
The line in §2 assumes **"operationally complete + engaging + gets paid + reaches members,"** deferring the self-serve marketing funnel + analytics + chain-scale features to V2. Confirm that's the right bar for Proline, or adjust:
- **Leaner** (cut camps/WhatsApp to V1.1; ship the operational+engagement core fastest), or
- **Fuller** (pull e-sign / freeze-upgrade / offline into V1), or
- **Growth-first** (the roadmap's alternative: pull the marketing funnel / nurture earlier if filling classes is the urgent business pain).

→ Your answer sets the must-have line; everything else stays JIT-designed against it.
