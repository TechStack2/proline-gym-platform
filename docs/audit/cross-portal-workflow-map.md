# Cross-Portal Workflow Map — The Mechanical Backbone

> **Created:** 2026-06-08 · **Auditor:** Project Auditor
> **Purpose:** Define how every gym activity propagates across the four portals, so features are built as **vertical slices** (source → all consumer surfaces) rather than isolated per-portal pages.
> **Trigger:** Live testing revealed the platform is incoherent across portals — data created/seeded in one place never surfaces in another. Root cause: the identity/profile foundation (see [foundation finding](./session-audit-plan.md)). This map is the model the rebuild follows.

---

## 1. The Propagation Principle

> **Everything is created once in the Admin dashboard (the source of truth), then propagates to exactly the portals that need it, and state flows back up.**

A feature is **not "done"** until its full propagation path works end-to-end on real data, verified by logging into each affected portal. "The page renders" is not done.

```
        ┌─────────────────────────────────────────────┐
        │   ADMIN DASHBOARD  (source of truth)         │
        │   create class / offer / package / plan /    │
        │   belt curriculum / announcement             │
        └───────────────┬─────────────────────────────┘
                        │ publish / assign
       ┌────────────────┼───────────────────┬──────────────────┐
       ▼                ▼                   ▼                  ▼
  LANDING PAGE     STUDENT PORTAL       COACH PORTAL       NOTIFICATIONS
  (public offers/  (browse, request,    (assigned roster,  (every handoff
   schedule/       book, view status,   deliver, log,      pings the next
   pricing)        see progress)        assess)            actor)
       │                │                   │                  │
       └──────── state flows back up: request→approve→bill→roster→consume→progress ───────┘
```

---

## 2. Entity → Portal Propagation Matrix

For each thing management creates, where it must appear and what handoffs fire. **Bold = currently broken/missing.**

| Entity (created in Admin) | Landing | Student Portal | Coach Portal | Handoffs / state flow |
|---------------------------|---------|----------------|--------------|------------------------|
| **Class + schedule** | (optional) public schedule | **browse → book / join waitlist**; see enrolled classes | **appears on assigned coach's schedule + roster**; take attendance | enroll → **confirmation notif**; attend → progress + (PT) credit |
| **Camp / Offer / Promo** | **featured on landing** | **view → register** | assigned coach sees camp roster | register → **invoice** → **notify**; capacity/waitlist |
| **PT Package** | pricing | **request PT** (pick pkg + preferred coach) | **"My PT Students" roster + Log session** | request → approve → **bill** → roster → **consume credit** |
| **Membership Plan** | pricing | **buy / renew**; membership status | — | purchase → **invoice**; **expiry → renewal reminder** |
| **Belt / Curriculum** | — | **visible rank + progress + history** | **assess + recommend promotion** | promote → **notify student/parent** |
| **Announcement / News** | **home/landing feed** | **portal feed** | coach feed | publish → **notify** |
| **Lead (inbound)** | trial CTA form | (becomes student on convert) | trial coach assignment | capture → **notify staff** → trial → **convert = real student+membership+invoice** |

Every **bold** cell is a known gap (see [gap-log.md](./gap-log.md) / [industry-benchmark.md](./industry-benchmark.md)).

---

## 3. Identity Model — the prerequisite for all of the above

Cross-portal propagation only works if identities are **coherent and linked** from the gym down. The required, currently-broken chain:

```
auth.users (login)
   └─1:1─> profiles (id = auth uid, gym_id)          ← MISSING for all demo logins
              ├─ user_roles (role per gym)            ← exists
              ├─(if student)─> students (profile_id)  ← demo student NOT linked
              └─(if coach)───> coaches (profile_id)   ← demo coach NOT linked
```

**Rules the rebuild must enforce:**
- Every `auth.users` insert ⇒ a `profiles` row (auto-trigger, on for signups AND demo).
- A demo/seed login that is a *student* ⇒ has a `students` row; a *coach* ⇒ has a `coaches` row — in the **same gym** as the data they should see.
- `owner@`/`reception@`/`head_coach@` ⇒ `profiles.gym_id = proline-gym`, so they see the seeded roster.
- Seed must run **after** the identities it references exist (fix migration ordering), or be idempotent and re-runnable.

A coherent demo gym = the acceptance bar: `owner@` sees the full roster; `student@` **is** an enrolled student with classes/belt/billing; `coach@` **is** a coach with a real roster.

---

## 4. Delivery Model Change — Vertical Slices

**Old (failed) model:** build per-portal pages in isolation; verify with `tsc`/`build`. Result: pages that render against empty/incoherent data.

**New model:** each feature ships as a **vertical slice** across its propagation row in §2, with a mandatory **cross-portal smoke test on real data**:
1. Create/seed the entity in Admin.
2. Verify it surfaces on every consumer portal (landing/student/coach) for the right users.
3. Drive the handoff; verify state flows back and notifications fire.
4. Only then: "done."

Every coder prompt from here carries this acceptance bar. Build-green is necessary but **never sufficient**.

---

## 5. How this reshapes the roadmap

A **Phase 0 — Foundation & Identity Integrity** is inserted before everything (§3 must be true or nothing renders). Then the flow work (PT/Lead/Enroll) is re-run as vertical slices that will now actually show data. See [platform-elevation-roadmap.md](./platform-elevation-roadmap.md).
