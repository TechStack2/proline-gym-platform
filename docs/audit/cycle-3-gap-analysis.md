# Cycle 3 — Gap Analysis

> **Date:** 2026-06-08  
> **Scope:** i18n hardcoded strings scan, portal stubs audit, residual low-priority re-assessment  
> **Methodology:** grep scan of `locale === 'ar'` / `locale === 'en'` / `locale === 'fr'` across `src/app/` (64 unique files, ~152+ individual hardcoded string sites)

---

## 1. i18n Hardcoded Strings

### Summary

| Metric | Count |
|--------|-------|
| Unique files with hardcoded locale checks | **64** |
| Estimated total hardcoded string sites | **~152+** |
| Phase C dashboard residuals (belts, camps, pt, rentals, leads) | **~30** |
| Non-Phase-C dashboard residuals | **~80** |
| Coach portal residuals | **~25** |
| Member portal residuals | **~15** |
| Marketing site residuals | **~4** |

### By Module/Portal

#### Phase C Dashboard (belts, camps, pt, rentals, leads)

| Module | File | Count | Example |
|--------|------|-------|---------|
| Belts | [`belt-engine-client.tsx`](src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx) | ~10 | `locale === 'ar' ? b.name_ar : locale === 'fr' ? b.name_fr : b.name_en` (line 318) |
| Belts | [`page.tsx`](src/app/[locale]/(dashboard)/belts/page.tsx) | 1 | `locale === 'ar' && 'font-arabic'` (line 87) |
| Camps | [`camps-client.tsx`](src/app/[locale]/(dashboard)/camps/camps-client.tsx) | 2 | `locale === 'ar' ? camp.name_ar : locale === 'fr' ? camp.name_fr : camp.name_en` (line 215) |
| Camps | [`page.tsx`](src/app/[locale]/(dashboard)/camps/page.tsx) | 1 | `locale === 'ar' && 'font-arabic'` (line 42) |
| PT | [`pt-client.tsx`](src/app/[locale]/(dashboard)/pt/pt-client.tsx) | 2 | `locale === 'ar' ? pkg.name_ar : locale === 'fr' ? pkg.name_fr : pkg.name_en` (line 216) |
| PT | [`page.tsx`](src/app/[locale]/(dashboard)/pt/page.tsx) | 1 | `locale === 'ar' && 'font-arabic'` (line 43) |
| Rentals | [`rentals-client.tsx`](src/app/[locale]/(dashboard)/rentals/rentals-client.tsx) | 3 | `locale === 'ar' ? r.name_ar : r.name_en` (line 193) |
| Rentals | [`page.tsx`](src/app/[locale]/(dashboard)/rentals/page.tsx) | 1 | `locale === 'ar' && 'font-arabic'` (line 42) |
| Leads | [`leads-client.tsx`](src/app/[locale]/(dashboard)/leads/leads-client.tsx) | 2 | `locale === 'ar'` / `locale === 'fr'` for discipline names |
| Leads | [`page.tsx`](src/app/[locale]/(dashboard)/leads/page.tsx) | 1 | `isRTL = locale === 'ar'` |

#### Non-Phase-C Dashboard (settings, reports, notifications, profile, attendance, classes, coaches, students, payments, invoices, schedule, disciplines, dashboard)

| Module | File | Count | Example |
|--------|------|-------|---------|
| Settings | [`_components/*.tsx`](src/app/[locale]/(dashboard)/settings/_components/) | ~30+ | `isRTL ? 'الإعدادات' : locale === 'fr' ? 'Paramètres' : 'Settings'` (page.tsx:43) |
| Reports | [`_components/*.tsx`](src/app/[locale]/(dashboard)/reports/_components/) | ~10 | `locale === 'ar' ? 'الطالب' : 'Student'` (attendance-report.tsx:83) |
| Notifications | [`notifications-client.tsx`](src/app/[locale]/(dashboard)/notifications/notifications-client.tsx) | ~12 | `locale === 'ar' ? 'الآن' : locale === 'fr' ? "À l'instant" : 'Just now'` (line 33) |
| Notifications | [`page.tsx`](src/app/[locale]/(dashboard)/notifications/page.tsx) | 1 | `locale === 'ar' ? 'يجب تسجيل الدخول'` (line 17) |
| Profile | [`page.tsx`](src/app/[locale]/(dashboard)/profile/page.tsx) | ~15 | `isRTL ? 'معلومات الحساب' : locale === 'fr' ? 'Informations du compte' : 'Account Info'` (line 108) |
| Attendance | [`page.tsx`, `*-client.tsx`, `history/`](src/app/[locale]/(dashboard)/attendance/) | ~6 | `locale === 'ar' && "flex-row-reverse"` (attendance-dashboard-client.tsx:195) |
| Classes | [`ClassesList.tsx`, `AddClassModal.tsx`, `[id]/`](src/app/[locale]/(dashboard)/classes/) | ~4 | `isRTL = locale === 'ar'` |
| Coaches | [`page.tsx`, `components/*`](src/app/[locale]/(dashboard)/coaches/) | ~5 | `locale === 'ar' ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en` (add/page.tsx:21) |
| Students | [`page.tsx`, `components/*`, `add/`](src/app/[locale]/(dashboard)/students/) | ~5 | `locale === 'ar' ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en` (add/page.tsx:35) |
| Payments | [`components/*`](src/app/[locale]/(dashboard)/payments/components/) | ~2 | `locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : 'en-US'` |
| Invoices | [`components/*`](src/app/[locale]/(dashboard)/invoices/components/) | ~1 | Same date locale pattern |
| Schedule | [`WeeklySchedule.tsx`](src/app/[locale]/(dashboard)/schedule/WeeklySchedule.tsx) | 1 | `isRTL = locale === 'ar'` |
| Disciplines | [`page.tsx`, `components/*`](src/app/[locale]/(dashboard)/disciplines/) | ~2 | `isRTL = locale === 'ar'` |
| Dashboard | [`page.tsx`](src/app/[locale]/(dashboard)/dashboard/page.tsx) | 1 | `isRTL = locale === 'ar'` |
| Layout | [`layout.tsx`, `_components/*`](src/app/[locale]/(dashboard)/) | ~3 | `isRTL = locale === 'ar'` |

#### Coach Portal

| Module | File | Count | Example |
|--------|------|-------|---------|
| Coach Home | [`page.tsx`](src/app/[locale]/coach/page.tsx) | 1 | `isRTL ? 'لا توجد حصص مجدولة' : 'No scheduled classes'` (line 12) |
| Coach Attendance | [`attendance/page.tsx`](src/app/[locale]/coach/attendance/page.tsx) | 1 | `isRTL ? 'اختر حصة لبدء تسجيل الحضور' : 'Select a class to start'` (line 12) |
| Coach Students | [`students/page.tsx`](src/app/[locale]/coach/students/page.tsx) | 1 | `isRTL ? 'لا يوجد طلاب مسجلين' : 'No enrolled students'` (line 12) |
| Coach Profile | [`profile/page.tsx`](src/app/[locale]/coach/profile/page.tsx) | ~22 | `isRTL ? 'مدرب' : locale === 'fr' ? 'Entraîneur' : 'Coach'` (line 97) |

#### Member Portal

| Module | File | Count | Example |
|--------|------|-------|---------|
| Portal Home | [`page.tsx`](src/app/[locale]/portal/page.tsx) | ~8 | `isRTL ? 'مرحباً' : 'Welcome'` (line 92) |
| Portal Schedule | [`schedule/page.tsx`](src/app/[locale]/portal/schedule/page.tsx) | ~4 | `isRTL ? 'جدول الحصص' : 'Class Schedule'` (line 85) |
| Portal Profile | [`profile/page.tsx`](src/app/[locale]/portal/profile/page.tsx) | ~3 | `isRTL ? 'عضو' : 'Member'` (line 52) |
| Portal Billing | [`billing/page.tsx`](src/app/[locale]/portal/billing/page.tsx) | ~4 | `isRTL ? 'الفواتير' : 'Invoices'` (line 53) |

#### Marketing Site

| Module | File | Count | Example |
|--------|------|-------|---------|
| Landing | [`(marketing)/page.tsx`](src/app/[locale]/(marketing)/page.tsx) | ~4 | `locale === 'ar' ? 'المخيمات القادمة' : locale === 'fr' ? 'Camps à Venir' : 'Upcoming Camps'` (line 39) |

#### Auth & Layout

| Module | File | Count | Example |
|--------|------|-------|---------|
| Auth | [`login/page.tsx`, `layout.tsx`, `verify/page.tsx`](src/app/[locale]/auth/) | ~3 | `isRTL = locale === 'ar'` |
| Root Layout | [`layout.tsx`](src/app/[locale]/layout.tsx) | 1 | `isRTL = locale === 'ar'` (line 47) |

### Total Remaining: ~152+ hardcoded strings across 64 files
### Priority Targets (Phase C residuals): ~30 strings across 10 files

---

## 2. i18n Key Inventory

| Namespace | en.json | ar.json | fr.json | Status |
|-----------|---------|---------|---------|--------|
| app | 4 | 4 | 4 | ✅ MATCH |
| attendance | 7 | 7 | 7 | ✅ MATCH |
| auth | 20 | 20 | 20 | ✅ MATCH |
| belts | 38 | 38 | 38 | ✅ MATCH |
| camps | 21 | 21 | 21 | ✅ MATCH |
| classes | 37 | 37 | 37 | ✅ MATCH |
| coaches | 19 | 19 | 19 | ✅ MATCH |
| common | 72 | 72 | 72 | ✅ MATCH |
| dashboard | 19 | 19 | 19 | ✅ MATCH |
| direction | 3 | 3 | 3 | ✅ MATCH |
| disciplines | 19 | 19 | 19 | ✅ MATCH |
| invoices | 33 | 33 | 33 | ✅ MATCH |
| landing | 2 | 2 | 2 | ✅ MATCH |
| language | 4 | 4 | 4 | ✅ MATCH |
| leads | 12 | 12 | 12 | ✅ MATCH |
| nav | 20 | 20 | 20 | ✅ MATCH |
| payments | 56 | 56 | 56 | ✅ MATCH |
| pt | 19 | 19 | 19 | ✅ MATCH |
| rentals | 18 | 18 | 18 | ✅ MATCH |
| schedule | 10 | 10 | 10 | ✅ MATCH |
| status | 8 | 8 | 8 | ✅ MATCH |
| students | 47 | 47 | 47 | ✅ MATCH |
| validation | 8 | 8 | 8 | ✅ MATCH |
| **Total** | **548** | **548** | **548** | ✅ **ALL MATCH** |

**Conclusion:** All 3 locale files have identical structure — 23 top-level namespaces, each with identical key counts. The i18n framework (`next-intl`) is properly set up with full key coverage. The problem is that the codebase does not use these keys; instead it uses inline `locale === 'x'` ternary expressions.

---

## 3. Portal Stubs Assessment

### Coach Portal

| File | Functional? | Assessment |
|------|-------------|------------|
| [`layout.tsx`](src/app/[locale]/coach/layout.tsx) | ✅ YES | Auth guard (redirects to login if no user). Wraps with `CoachLayoutClient`. |
| [`page.tsx`](src/app/[locale]/coach/page.tsx) | ❌ **STUB** | Shows only "No scheduled classes" placeholder. No schedule data fetching. No class list. No coach dashboard. |
| [`attendance/page.tsx`](src/app/[locale]/coach/attendance/page.tsx) | ❌ **STUB** | Shows only "Select a class to start" placeholder. No class selector, no QR scanner, no attendance marking UI. |
| [`students/page.tsx`](src/app/[locale]/coach/students/page.tsx) | ❌ **STUB** | Shows only "No enrolled students" placeholder. No student list, no search, no student detail links. |
| [`profile/page.tsx`](src/app/[locale]/coach/profile/page.tsx) | ✅ **FUNCTIONAL** | Full profile display with name, specialization, belt rank, stats (classes count, students count), contact info, roles, hourly rate, bio, joined date. Uses `locale === 'x'` for i18n (not `next-intl`). |
| [`_components/CoachLayoutClient.tsx`](src/app/[locale]/coach/_components/CoachLayoutClient.tsx) | ✅ YES | Layout client component with navigation. |

**Missing Features (Coach Portal):**
- Coach dashboard with today's schedule
- Class attendance marking (QR scan or manual)
- Student roster with search/filter
- Class history view
- Schedule management
- Communication tools

### Member/Student Portal

| File | Functional? | Assessment |
|------|-------------|------------|
| [`layout.tsx`](src/app/[locale]/portal/layout.tsx) | ✅ YES | Auth guard (redirects to login if no user). Wraps with `PortalLayoutClient`. |
| [`page.tsx`](src/app/[locale]/portal/page.tsx) | ✅ **FUNCTIONAL** | Full dashboard with: welcome greeting, stats cards (classes, membership, belt, balance), quick links (schedule, billing), current membership card, current belt display, recent attendance list. Data fetched from Supabase. |
| [`schedule/page.tsx`](src/app/[locale]/portal/schedule/page.tsx) | ✅ **FUNCTIONAL** | Shows enrolled classes grouped by day of week. Displays class name, discipline, time, room, coach name. Handles empty state. |
| [`profile/page.tsx`](src/app/[locale]/portal/profile/page.tsx) | ✅ **FUNCTIONAL** | Full profile with avatar, name, membership, belt, member details (joined date, emergency contact, medical notes), guardians list. Data fetched from Supabase. |
| [`billing/page.tsx`](src/app/[locale]/portal/billing/page.tsx) | ✅ **FUNCTIONAL** | Shows membership info, invoices list with status badges, payment history. Data fetched from Supabase. |
| [`_components/PortalLayoutClient.tsx`](src/app/[locale]/portal/_components/PortalLayoutClient.tsx) | ✅ YES | Layout client component with navigation. |

**Auth Flow (Student Login):**
1. User visits any portal page
2. [`layout.tsx`](src/app/[locale]/portal/layout.tsx) calls `supabase.auth.getUser()`
3. If no user → redirect to `/${locale}/auth/login`
4. If user exists → renders `PortalLayoutClient` with children
5. Individual pages further check `user` and return `null` if missing (defensive)

**Missing Features (Member Portal):**
- Online class enrollment/registration
- Payment processing (online payments)
- Attendance QR check-in
- Communication with coaches
- Progress tracking (belt history chart)

### Marketing Site

| File | Functional? | Assessment |
|------|-------------|------------|
| [`(marketing)/page.tsx`](src/app/[locale]/(marketing)/page.tsx) | ✅ **FUNCTIONAL** | Full landing page with: `HeroSection`, `DisciplinesSection`, `WhySection`, `PricingSection`, camps section (fetches upcoming camps from Supabase), `FacilitySection`, `TrialCTASection`. Camps section has hardcoded i18n strings. |

**Assessment:** The marketing landing page is **functional** — it imports real components and fetches live camp data. However, the camps section within the page itself uses hardcoded `locale === 'x'` strings rather than `next-intl` keys. The imported section components (`HeroSection`, `DisciplinesSection`, etc.) may also have hardcoded strings internally.

### Non-Phase-C Dashboard Pages

| Page | Functional? | Assessment |
|------|-------------|------------|
| [`settings/page.tsx`](src/app/[locale]/(dashboard)/settings/page.tsx) | ✅ **FUNCTIONAL** | Full settings page with tabs (gym info, membership plans, exchange rates, discipline settings). Fetches gym data, rates, plans, disciplines from Supabase. Uses `SettingsClient` component. Hardcoded i18n. |
| [`reports/page.tsx`](src/app/[locale]/(dashboard)/reports/page.tsx) | ✅ **FUNCTIONAL** | Full reports page with tabbed interface (Attendance, Revenue, Belt Progression). Each tab fetches real data from Supabase. `AttendanceReport`, `RevenueReport`, `BeltProgressionReport` are all functional client components. Hardcoded i18n. |
| [`notifications/page.tsx`](src/app/[locale]/(dashboard)/notifications/page.tsx) | ✅ **FUNCTIONAL** | Full notifications page with auth guard. Fetches notifications from Supabase. `NotificationsClient` renders notification list with read/unread status, timestamps, mark-all-read. Hardcoded i18n. |
| [`profile/page.tsx`](src/app/[locale]/(dashboard)/profile/page.tsx) | ✅ **FUNCTIONAL** | Full staff profile page with avatar, roles, account info, and an edit form (server action `updateProfile`). Supports multi-locale name editing. Hardcoded i18n. |

**Auth Guards:** All dashboard pages use `createClient()` from `@/lib/supabase/server` and check `user`. If no user, they return `null` (silent fail) rather than redirecting. The dashboard [`layout.tsx`](src/app/[locale]/(dashboard)/layout.tsx) does NOT have an auth guard — it only sets RTL direction.

**gym_id Isolation:** Settings page fetches gym data with `.limit(1).single()` (no gym_id filter). PT page uses `gymId` from profile. Reports and notifications do not filter by gym_id. Profile is user-specific.

**i18n:** All pages use `locale === 'x'` hardcoded ternary patterns. None use `next-intl` `t()` function except the PT page which calls `getTranslations('pt')` for the title/subtitle but still has hardcoded strings for the heading font.

---

## 4. Residual Items Re-Assessment

| # | Original Severity | Item | Actual Severity | Notes |
|---|------------------|------|-----------------|-------|
| 1 | **LOW** | CSP `unsafe-inline`/`unsafe-eval` in all environments | **MEDIUM** | Confirmed in [`next.config.mjs`](next.config.mjs:122-123): `script-src 'self' 'unsafe-inline' 'unsafe-eval'` and `style-src 'self' 'unsafe-inline'`. This is a security risk — defeats CSP purpose. Next.js can use nonces for scripts. Should be tightened to at least `'strict-dynamic'` or nonce-based. **Upgrade to MEDIUM** because it affects all environments (dev, staging, prod). |
| 2 | **LOW** | Rate limiting not in middleware | **MEDIUM** | No custom middleware file exists in the project root or `src/`. The only middleware is from `next-intl` (in `node_modules`). No rate limiting is implemented at the application layer. Supabase has its own rate limits, but there's no protection against brute-force auth attempts or API abuse at the Next.js edge. **Upgrade to MEDIUM** because auth endpoints are exposed without rate limiting. |
| 3 | **LOW** | `rental_bookings` RLS uses bare `is_staff()` | **MEDIUM** | Confirmed in [`000004_create_rls_policies.sql`](supabase/migrations/000004_create_rls_policies.sql:60): `CREATE POLICY rental_bookings_staff ON rental_bookings FOR ALL USING (is_staff());` — no `gym_id` check. This means any staff user from any gym can access all rental bookings across all gyms. **Upgrade to MEDIUM** because it's a multi-tenant isolation breach. Migration `000011_fix_rls_gym_scoping.sql` fixed other junction tables but did NOT fix `rental_bookings`. |
| 4 | **LOW** | Seed data ordering issue | **LOW** | The seed file [`000006_seed_data.sql`](supabase/migrations/000006_seed_data.sql) uses `UNION ALL` with `SELECT ... FROM gyms WHERE slug = 'proline-gym'` for each discipline. This is deterministic within a single migration run. The ordering is explicit via `sort_order` column. No actual ordering bug found. **Remain LOW** — no evidence of a real issue. |
| 5 | **LOW** | `pt/page.tsx` sequential await | **LOW** | [`pt/page.tsx`](src/app/[locale]/(dashboard)/pt/page.tsx) has 4 sequential `await` calls: `getUser()`, `profile`, `packages`, `students`. These could be parallelized with `Promise.all()`. However, `packages` depends on `gymId` from `profile`, and `students` also depends on `gymId`. So only `profile` could be parallelized with `getUser()`. Minor optimization opportunity. **Remain LOW.** |

### Re-Assessment Summary

| Original Severity | Count | Upgraded | Downgraded |
|-------------------|-------|----------|------------|
| LOW | 5 | 3 → MEDIUM | 0 |

**Items upgraded to MEDIUM:**
1. CSP `unsafe-inline`/`unsafe-eval` — security risk, all environments affected
2. Rate limiting not in middleware — auth endpoints exposed without protection
3. `rental_bookings` RLS uses bare `is_staff()` — multi-tenant isolation gap (missed by migration 000011)

---

## 5. Key Findings Summary

### Critical (should be addressed in Cycle 3):
1. **~152 hardcoded strings across 64 files** — the i18n framework is fully set up (548 keys per locale, 23 namespaces, all matching) but the codebase doesn't use it. This is a massive migration effort.
2. **Coach portal is 80% stub** — only profile page is functional; home, attendance, and students are placeholders.
3. **3 residual items upgraded to MEDIUM** — CSP, rate limiting, and RLS isolation gap.

### Important:
4. **Dashboard layout has no auth guard** — individual pages handle auth silently (return null) instead of redirecting.
5. **gym_id isolation is inconsistent** — settings page uses `.limit(1)` instead of filtering by gym_id.
6. **Member portal is fully functional** — all 4 pages (home, schedule, profile, billing) work with real data.

### Quick Wins:
7. **PT page** — minor optimization (parallelize `getUser()` and `profile` fetch).
8. **Seed data** — no actual ordering issue found; can be closed.
