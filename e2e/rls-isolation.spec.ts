import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, roleEmail } from './roles';
import { gymSlug, runId } from './helpers';

/**
 * RLS-ISOLATION — cross-tenant READ isolation on audit_logs + pt_sessions
 * (migrations 000069 pt_sessions-by-coach-gym, 000070 audit_logs-gym).
 *
 * Provisions marker rows in TWO gyms — A = this worker's e2e gym, B = the seeded
 * demo gym (`proline-gym`) — via the SERVICE role (bypasses RLS), then queries
 * THROUGH RLS as gym A's OWNER (a real GoTrue password grant, NOT the service
 * key) and proves:
 *   • gym A owner reads ZERO of gym B's audit_logs AND pt_sessions
 *   • same-gym still works (gym A owner sees gym A's own rows)
 * API-only (no browser) via the Playwright `request` fixture.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

test('RLS-ISOLATION · gym A staff read ZERO gym-B audit_logs + pt_sessions; same-gym works', async ({ request }) => {
  test.skip(!URL || !ANON || !SVC, 'needs the local Supabase env (URL + anon + service-role key)');

  const svcHeaders = {
    apikey: SVC, Authorization: `Bearer ${SVC}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
  };
  const svcGet = async (path: string) => (await request.get(`${URL}/rest/v1/${path}`, { headers: svcHeaders })).json();
  const svcPost = async (path: string, body: unknown) => request.post(`${URL}/rest/v1/${path}`, { headers: svcHeaders, data: body });

  const tag = `rls-${runId()}`;
  const when = '2035-06-01T10:00:00Z'; // far-future → no clash with seeded coach slots
  try {
    // ── Resolve the two gyms ──
    const [gymA] = await svcGet(`gyms?slug=eq.${gymSlug()}&select=id`);
    const [gymB] = await svcGet(`gyms?slug=eq.proline-gym&select=id`);
    expect(gymA?.id, 'gym A (this worker) exists').toBeTruthy();
    expect(gymB?.id, 'gym B (demo) exists').toBeTruthy();
    expect(gymA.id, 'the two gyms are distinct').not.toBe(gymB.id);

    // A coach + student in each gym (for the pt_sessions markers).
    const pick = async (table: string, gym: string) => (await svcGet(`${table}?gym_id=eq.${gym}&select=id&limit=1`))[0]?.id;
    const [coachA, studentA, coachB, studentB] = await Promise.all([
      pick('coaches', gymA.id), pick('students', gymA.id), pick('coaches', gymB.id), pick('students', gymB.id),
    ]);
    for (const [k, v] of Object.entries({ coachA, studentA, coachB, studentB })) expect(v, `${k} exists`).toBeTruthy();

    // ── Provision marker rows in BOTH gyms (service role bypasses RLS) ──
    await svcPost('audit_logs', [
      { table_name: tag, operation: 'update', gym_id: gymA.id },
      { table_name: tag, operation: 'update', gym_id: gymB.id },
    ]);
    const [ptA] = await (await svcPost('pt_sessions', { student_id: studentA, coach_id: coachA, scheduled_at: when, status: 'scheduled', notes_en: tag })).json();
    await svcPost('pt_sessions', { student_id: studentB, coach_id: coachB, scheduled_at: when, status: 'scheduled', notes_en: tag });
    expect(ptA?.id, 'gym A marker session created').toBeTruthy();

    // ── Sign in as gym A's OWNER — a real JWT, so queries pass THROUGH RLS ──
    const tokRes = await request.post(`${URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      data: { email: roleEmail('owner'), password: E2E_PASSWORD },
    });
    const jwt = (await tokRes.json()).access_token as string | undefined;
    expect(jwt, 'gym A owner signs in').toBeTruthy();
    const asA = async (path: string) =>
      (await request.get(`${URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } })).json();

    // ── NEGATIVE: gym A owner reads ZERO of gym B ──
    expect(await asA(`audit_logs?gym_id=eq.${gymB.id}&select=id`), 'ZERO gym-B audit_logs visible to gym A').toEqual([]);
    expect(await asA(`pt_sessions?coach_id=eq.${coachB}&select=id`), 'ZERO gym-B pt_sessions visible to gym A').toEqual([]);

    // ── POSITIVE: same-gym still works ──
    const aAudit = await asA(`audit_logs?table_name=eq.${tag}&select=id,gym_id`);
    expect(aAudit.length, 'gym A owner DOES see the gym-A audit marker').toBeGreaterThan(0);
    expect(aAudit.every((r: { gym_id: string }) => r.gym_id === gymA.id), 'every visible audit row is gym A').toBe(true);
    const aPt = await asA(`pt_sessions?coach_id=eq.${coachA}&select=id`);
    expect(aPt.length, 'gym A owner DOES see gym-A pt_sessions').toBeGreaterThan(0);
  } finally {
    // Tidy the markers (the demo gym B is shared across the local stack).
    await request.delete(`${URL}/rest/v1/audit_logs?table_name=eq.${tag}`, { headers: svcHeaders }).catch(() => {});
    await request.delete(`${URL}/rest/v1/pt_sessions?notes_en=eq.${tag}`, { headers: svcHeaders }).catch(() => {});
  }
});
