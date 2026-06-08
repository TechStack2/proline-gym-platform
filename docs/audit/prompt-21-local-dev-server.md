## PROMPT 21: Start Local Dev Server for UI Testing

**Mode:** code
**Priority:** P1
**Depends On:** None

### Context
All 4 audit cycles are complete. The platform builds successfully (`next build` passes, `tsc --noEmit` zero errors). The stakeholder needs a local dev server running so they can visually test the UI workflows before marking the platform production-ready.

### Required Deliverables

#### 1. Verify Environment

Check that [`.env.local`](.env.local) exists with valid values:

```
NEXT_PUBLIC_SUPABASE_URL=https://ufpuebfkcpohwubrutff.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_gY4s593qgIpo42qUNuPLiQ_zaO8DyJn
```

If either is missing or appears invalid, stop and report exactly what's needed.

#### 2. Start the Dev Server

Run `npm run dev` from the project root (`/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform`). The server should start on `http://localhost:3000`.

**Note:** The package.json dev script is `next dev` — use `npm run dev`, not `npx next dev`.

#### 3. Verify It's Running

After the server starts, confirm it responds on `http://localhost:3000`. Log the exact URL the stakeholder should open.

#### 4. Provide Test Credentials

Extract the demo accounts from [`supabase/migrations/000008_demo_accounts.sql`](supabase/migrations/000008_demo_accounts.sql).

**CRITICAL — Password Discovery:** The migration uses `current_setting('app.demo_password')` with bcrypt — the plaintext password is NOT stored in source code. You MUST:

1. Connect to the Supabase SQL Editor or run a query to retrieve it:
   ```sql
   SELECT current_setting('app.demo_password');
   ```
2. If the setting is not configured, report this as a BLOCKER and ask the stakeholder to set it:
   ```sql
   ALTER DATABASE postgres SET app.demo_password = 'the-actual-password';
   ```
3. If you cannot access the database directly, try common demo passwords such as `ProlineDemo2024!` (the original password from before the security fix in Prompt 9).

**IMPORTANT:** The smoke-test checklist at [`docs/testing/smoke-test-checklist.md`](docs/testing/smoke-test-checklist.md) references emails with the domain `@proline.gym` (e.g., `owner@proline.gym`), but the migration `000008` uses `@prolinegym.lb`. The migration is the source of truth. Use `@prolinegym.lb` emails. If login fails, check whether `@proline.gym` accounts exist instead — the Supabase dashboard can confirm which users are in `auth.users`.

Present the demo accounts clearly:

```
### Demo Accounts for UI Testing

| Role | Email | Password | Portal |
|------|-------|----------|--------|
| Owner | owner@prolinegym.lb | [discovered password] | /dashboard |
| Head Coach | coach@prolinegym.lb | [discovered password] | /coach |
| Receptionist | reception@prolinegym.lb | [discovered password] | /dashboard |
| Student | student@prolinegym.lb | [discovered password] | /student |
```

#### 5. Provide Navigation Guide

Reference the smoke-test checklist at [`docs/testing/smoke-test-checklist.md`](docs/testing/smoke-test-checklist.md) for the full 9 test cases. Present this summary:

```
| # | Page | URL | What to Test | Priority |
|---|------|-----|-------------|----------|
| 1 | Login (Owner) | /en/login | Sign in as owner, verify dashboard loads | P1 |
| 2 | Login (Coach) | /en/login | Sign in as coach, verify coach portal loads | P1 |
| 3 | Leads | /dashboard/leads | Create lead, verify appears in list with correct status | P1 |
| 4 | Leads Status | /dashboard/leads | Change lead status, refresh, verify persists | P1 |
| 5 | Camps 🔴 | /dashboard/camps | Create a camp — this was the CRITICAL gym_id bug | P0 |
| 6 | PT Packages | /dashboard/pt | Create package, assign to student, verify credit tracking | P1 |
| 7 | Belt Promotion | /dashboard/belts | Promote student through 3-step stepper | P1 |
| 8 | Arabic (RTL) | /ar/dashboard | Switch to Arabic, browse all modules — verify NO English strings, NO MISSING_MESSAGE keys | P1 |
| 9 | French (LTR) | /fr/dashboard | Switch to French, browse all modules — verify NO English strings, NO MISSING_MESSAGE keys | P1 |
```

**Default locale:** The `.env.local` sets `NEXT_PUBLIC_DEFAULT_LOCALE=ar`, so navigating to `http://localhost:3000` will redirect to `/ar`. To test English, use `/en/login` explicitly.

#### 6. Keep the Server Running

Do NOT stop the dev server. The stakeholder will test in their browser after you present the results.

### Validation Checklist
- [x] `.env.local` exists with valid Supabase URL and anon key
- [ ] `npm run dev` starts without errors
- [ ] Server responds at `http://localhost:3000`
- [ ] Demo password discovered and accounts table displayed
- [ ] Navigation guide presented with all 9 test cases
- [ ] Server left running for stakeholder testing

### MANDATORY: Update audit-cycle-update.md

After completing this prompt, append to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`:

```
## Cycle 5 — Prompt 21: Local Dev Server — [timestamp +03:00]
### Completed
- Started next dev on localhost:3000
- Verified .env.local has valid Supabase URL and anon key
- Discovered demo password and extracted 4 demo accounts from 000008
- Provided navigation guide with 9 smoke test cases
### Verified
- Server responds at http://localhost:3000
- Demo credentials displayed (owner, coach, receptionist, student)
- Smoke test checklist linked for stakeholder reference
### Notes
- Server left running for stakeholder UI testing
- Demo emails use @prolinegym.lb domain (migration source of truth)
- Smoke-test-checklist.md references @proline.gym — verified which domain is active
---
```

---

### Agent Instructions

This is a straightforward operational prompt. The key complexity is discovering the demo password, which is stored as a Supabase database setting (`app.demo_password`) — not in source code. If you cannot access the database, try `ProlineDemo2024!` (the original password before Prompt 9's security fix). If that fails, flag it as a blocker.

The smoke-test checklist at [`docs/testing/smoke-test-checklist.md`](docs/testing/smoke-test-checklist.md) provides detailed step-by-step instructions for each of the 9 test cases. Reference it directly rather than duplicating all the steps here.
