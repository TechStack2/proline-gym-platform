# PRO LINE Gym Platform — E2E Smoke Test Checklist

> **Date:** June 8, 2026  
> **Status:** PENDING — All tests require a running dev server (`npm run dev`) with Supabase connection.  
> **Purpose:** Final quality gate before declaring Cycle 4 complete.  
> **Test Accounts:** `owner@proline.gym` / `coach@proline.gym` (demo accounts from migration `000008`).

---

## Prerequisites

- [ ] Dev server running: `npm run dev` (port 3000)
- [ ] Supabase project connected (env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Database seeded: migrations `000001` through `000014` applied
- [ ] Browser: Chrome/Firefox/Safari (latest), incognito/private window recommended
- [ ] Demo accounts exist: `owner@proline.gym` (role: owner), `coach@proline.gym` (role: coach)

---

## Smoke Test Cases

| # | Test Case | Steps | Expected Result | Status |
|---|-----------|-------|-----------------|--------|
| 1 | **Login as owner → verify dashboard loads** | 1. Navigate to `http://localhost:3000/en/login`<br>2. Enter `owner@proline.gym` + demo password<br>3. Click "Sign In" | Redirect to `/en/dashboard`. Dashboard loads with sidebar navigation, stats cards visible. No blank screen, no error toasts, no `MISSING_MESSAGE` keys. All module links (Leads, Belts, Camps, PT, Rentals, Settings, Reports) present and clickable. | ⏳ PENDING |
| 2 | **Login as coach → verify coach portal loads** | 1. Navigate to `http://localhost:3000/en/login`<br>2. Enter `coach@proline.gym` + demo password<br>3. Click "Sign In" | Redirect to `/en/coach`. Coach portal home loads with "Today's Classes" list, stats bar (total classes, total students, completed/pending), and per-class cards with "Start Attendance" buttons. No blank screen, no error toasts. Tab bar shows Home, Attendance, Students, Profile. | ⏳ PENDING |
| 3 | **Create a lead → verify appears in list** | 1. Login as owner (Test #1)<br>2. Navigate to Leads module<br>3. Click "Add Lead" button<br>4. Fill in: name, phone, email, source, discipline<br>5. Click "Save" | Sonner toast: "Lead created successfully". New lead appears at top of the leads list with correct name, phone, source, and status (`new`). Lead count increments on the stats bar. No crash, no `MISSING_MESSAGE` keys in the form or list. | ⏳ PENDING |
| 4 | **Change lead status → verify persists** | 1. From the leads list (Test #3), locate any lead<br>2. Click the status badge/dropdown on that lead row<br>3. Select a new status (e.g., `contacted`, `trial_scheduled`)<br>4. Refresh the page (`Cmd+R` / `Ctrl+R`) | Sonner toast: "Status updated". After refresh, the lead still shows the new status — not reverted to old value. Stats bar updates to reflect the status change (e.g., "Contacted" count increments, "New" count decrements). | ⏳ PENDING |
| 5 | **Create a camp → verify appears** 🔴 CRITICAL | 1. Login as owner (Test #1)<br>2. Navigate to Camps module<br>3. Click "Create Camp" button<br>4. Fill in: name (EN/AR/FR), description, dates, capacity, price<br>5. Click "Save" | Sonner toast: "Camp created successfully". New camp appears in the camps list with correct name, dates, capacity, and status (`draft`). No crash, no `gym_id must be a UUID` error (this was the CRITICAL bug fix from Prompt 11). Camp persists after page refresh. | ⏳ PENDING |
| 6 | **Create a PT package → verify credit tracking shows** | 1. Login as owner (Test #1)<br>2. Navigate to PT Packages module<br>3. Click "Create Package" button<br>4. Fill in: name (EN/AR/FR), session count, price (USD/LBP), validity days<br>5. Click "Save"<br>6. Assign the package to a student using the "Assign" button and coach dropdown | Sonner toast: "Package created successfully". Package appears in the list. After assignment, the package card shows "X of Y sessions remaining" per student. Credit tracking UI visible with sessions_used / sessions_total display. No crash, no zero-UUID errors (`coach_id`, `gym_id`). | ⏳ PENDING |
| 7 | **Promote a student belt → verify stepper works** | 1. Login as owner (Test #1)<br>2. Navigate to Belts module<br>3. Step 1: Select a student from the dropdown<br>4. Step 2: Select a discipline<br>5. Step 3: Select a target belt rank + coach<br>6. Step 4: Review and confirm promotion<br>7. Click "Promote" | 3-step stepper advances through all steps: Student+Discipline → Belt+Coach → Review+Confirm. Visual progress indicator shows current step. Sonner toast: "Belt promoted successfully". Student's belt rank updates in the list. Cannot promote to same or lower rank (validated). Page auto-refreshes after promotion. | ⏳ PENDING |
| 8 | **Switch language to Arabic → verify no English strings** | 1. Login as owner (Test #1)<br>2. Click the language switcher in the header/sidebar<br>3. Select "العربية" (Arabic)<br>4. Browse: Dashboard → Leads → Belts → Camps → PT → Rentals → Settings → Reports | URL changes to `/ar/dashboard`. All UI text renders in Arabic (RTL layout applied). No English strings visible. No `MISSING_MESSAGE:` keys anywhere. No hardcoded English placeholders or labels. All module names, buttons, form labels, and toasts display in Arabic. | ⏳ PENDING |
| 9 | **Switch to French → verify no English strings** | 1. Login as owner (Test #1)<br>2. Click the language switcher in the header/sidebar<br>3. Select "Français" (French)<br>4. Browse: Dashboard → Leads → Belts → Camps → PT → Rentals → Settings → Reports | URL changes to `/fr/dashboard`. All UI text renders in French (LTR layout). No English strings visible. No `MISSING_MESSAGE:` keys anywhere. No hardcoded English placeholders or labels. All module names, buttons, form labels, and toasts display in French. | ⏳ PENDING |

---

## Results Summary

| Metric | Count |
|--------|:-----:|
| Total test cases | 9 |
| PASS | 0 |
| FAIL | 0 |
| PENDING (requires dev server) | 9 |
| BLOCKED | 0 |

---

## CRITICAL Bug Fix Verification

Test case #5 is the **critical verification gate** for the Cycle 3 Camp fix from Prompt 11. The original bug caused all camp creations to fail with:
```
ERROR: null value in column "gym_id" of relation "camps" violates not-null constraint
```
The fix passed a real `gymId` from the server page to the client component via props. This test **must pass** before Cycle 4 can be declared complete.

---

## Execution Log

| Date | Tester | Environment | Results | Notes |
|------|--------|-------------|---------|-------|
| — | — | — | — | Awaiting dev server + Supabase connection |
