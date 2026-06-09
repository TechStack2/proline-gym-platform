import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the notification producer helper (Cycle 5 / Prompt 21).
 *
 * The recipient-scoped/cross-gym RLS guarantees are proven by the pgTAP test
 * (supabase/tests/notifications_rls.test.sql, run via `supabase test db`).
 * These tests prove the helper's gym-scoping and key-storage behaviour against
 * a mocked Supabase client (runnable without a database):
 *   - createNotification writes a single gym-scoped row of i18n keys + params.
 *   - createNotificationForRole queries role holders scoped to the gym and
 *     fans out exactly one row per holder, each tagged with that gym.
 */

// Holds the mock client returned by the (mocked) server createClient().
const mockState: { client: unknown } = { client: null };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockState.client),
}));

import { createNotification, createNotificationForRole } from './create';

type Calls = {
  inserts: unknown[];
  roleFilters: Record<string, unknown>;
  roleHolders: { user_id: string }[];
  lastTable?: string;
};

function makeClient() {
  const calls: Calls = { inserts: [], roleFilters: {}, roleHolders: [] };

  const notificationsBuilder = {
    insert: vi.fn((rows: unknown) => {
      calls.inserts.push(rows);
      return notificationsBuilder;
    }),
    select: vi.fn(() => notificationsBuilder),
    single: vi.fn(async () => ({ data: { id: 'notif-1' }, error: null })),
    // Awaiting the builder directly (fan-out insert without .select()).
    then: (resolve: (v: { data: null; error: null }) => void) =>
      resolve({ data: null, error: null }),
  };

  const userRolesBuilder = {
    select: vi.fn(() => userRolesBuilder),
    eq: vi.fn((col: string, val: unknown) => {
      calls.roleFilters[col] = val;
      return userRolesBuilder;
    }),
    then: (resolve: (v: { data: { user_id: string }[]; error: null }) => void) =>
      resolve({ data: calls.roleHolders, error: null }),
  };

  const client = {
    from: vi.fn((table: string) => {
      calls.lastTable = table;
      return table === 'user_roles' ? userRolesBuilder : notificationsBuilder;
    }),
  };

  return { client, calls };
}

describe('createNotification', () => {
  let calls: Calls;

  beforeEach(() => {
    const c = makeClient();
    mockState.client = c.client;
    calls = c.calls;
  });

  it('writes a single gym-scoped row of i18n keys + params (RETURNING-free)', async () => {
    const result = await createNotification({
      recipientProfileId: 'student-1',
      type: 'enrollment_confirmed',
      titleKey: 'messages.enrollment_confirmed.title',
      bodyKey: 'messages.enrollment_confirmed.body',
      params: { className: 'BJJ' },
      entityType: 'class_enrollment',
      entityId: 'enroll-1',
      gymId: 'gym-1',
    });

    // id is generated client-side (so no INSERT ... RETURNING is issued, which
    // would otherwise be blocked by the recipient-only SELECT policy).
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toEqual({
      id: result.id,
      user_id: 'student-1',
      gym_id: 'gym-1',
      type: 'enrollment_confirmed',
      title_key: 'messages.enrollment_confirmed.title',
      body_key: 'messages.enrollment_confirmed.body',
      params: { className: 'BJJ' },
      entity_type: 'class_enrollment',
      entity_id: 'enroll-1',
      action_url: null,
    });
  });
});

describe('createNotificationForRole', () => {
  let calls: Calls;

  beforeEach(() => {
    const c = makeClient();
    mockState.client = c.client;
    calls = c.calls;
  });

  it('fans out one gym-scoped row per role holder', async () => {
    calls.roleHolders = [{ user_id: 'r1' }, { user_id: 'r2' }];

    const result = await createNotificationForRole({
      role: 'receptionist',
      gymId: 'gym-1',
      type: 'lead_new',
      titleKey: 'messages.lead_new.title',
      bodyKey: 'messages.lead_new.body',
    });

    expect(result).toEqual({ count: 2, recipientIds: ['r1', 'r2'] });
    // role holders were queried scoped to the role AND the gym
    expect(calls.roleFilters).toEqual({ role: 'receptionist', gym_id: 'gym-1' });
    // one batch insert of two rows, each tagged with the same gym
    expect(calls.inserts).toHaveLength(1);
    const rows = calls.inserts[0] as Array<{ user_id: string; gym_id: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.user_id)).toEqual(['r1', 'r2']);
    expect(rows.every((r) => r.gym_id === 'gym-1')).toBe(true);
  });

  it('inserts nothing when no profile holds the role in the gym', async () => {
    calls.roleHolders = [];

    const result = await createNotificationForRole({
      role: 'owner',
      gymId: 'gym-1',
      type: 'lead_new',
      titleKey: 'messages.lead_new.title',
      bodyKey: 'messages.lead_new.body',
    });

    expect(result).toEqual({ count: 0, recipientIds: [] });
    expect(calls.inserts).toHaveLength(0);
  });
});
