import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * OWNER-RESET — the platform-admin gate, pinned at the SERVER-ACTION layer.
 *
 * Why this test and not only an e2e: hiding the button proves nothing. A server action
 * is an HTTP endpoint, so the real question is what happens when the action function
 * itself is entered by a caller who is not a platform admin — with no page, no button
 * and no client code involved. That is exactly what these tests call.
 *
 * The mocked admin client THROWS a sentinel the moment it is touched (the
 * invite.test.ts idiom), which makes "reached the privileged path" OBSERVABLE. So a
 * denial is not merely "returned forbidden" — it is "returned forbidden AND never
 * constructed a service-role client, never called GoTrue, never set a password".
 *
 * The gate is also asserted to PASS for a real platform admin. Without that case the
 * whole file could pass while the action denied everyone, which would be a broken
 * feature wearing a green test.
 */
const state = {
  user: { id: 'admin-1', email: 'vendor@praxella.com' } as { id: string; email: string } | null,
  isPlatformAdmin: null as boolean | null,
  rpcError: null as { message: string } | null,
};
const adminTouched = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (fn: string) =>
      fn === 'is_platform_admin'
        ? { data: state.isPlatformAdmin, error: state.rpcError }
        : { data: null, error: null },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    adminTouched();
    throw new Error('REACHED_ADMIN');
  },
}));

// next/cache is a server-only module in this path; the action calls revalidatePath.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { lookupGymOwner, resetGymOwnerPassword } from './actions';

beforeEach(() => {
  adminTouched.mockClear();
  state.user = { id: 'admin-1', email: 'vendor@praxella.com' };
  state.isPlatformAdmin = null;
  state.rpcError = null;
});

const RESET_INPUT = { gymId: 'gym-1', ownerUserId: 'owner-1' };

describe('OWNER-RESET · resetGymOwnerPassword — the authorization gate', () => {
  it('refuses an ANONYMOUS caller and never touches the privileged client', async () => {
    state.user = null;
    const res = await resetGymOwnerPassword(RESET_INPUT);
    expect(res).toEqual({ ok: false, error: 'unauthorized' });
    expect(adminTouched, 'no service-role client for an anonymous caller').not.toHaveBeenCalled();
  });

  it('refuses a signed-in NON-platform-admin (a gym owner or staff member)', async () => {
    // The exact field case: a gym owner is a legitimate user with a real session.
    // Being authenticated is not being authorized.
    state.user = { id: 'gym-owner-9', email: 'owner@proline.lb' };
    state.isPlatformAdmin = false;
    const res = await resetGymOwnerPassword(RESET_INPUT);
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(adminTouched, 'a gym owner must not reach GoTrue admin').not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the gate RPC errors — an error is not permission', async () => {
    state.isPlatformAdmin = null;
    state.rpcError = { message: 'connection reset' };
    const res = await resetGymOwnerPassword(RESET_INPUT);
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(adminTouched).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the gate returns null rather than true', async () => {
    state.isPlatformAdmin = null;
    const res = await resetGymOwnerPassword(RESET_INPUT);
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(adminTouched).not.toHaveBeenCalled();
  });

  it('does not accept a truthy non-true gate value', async () => {
    // `isAdmin !== true` rather than `!isAdmin`: a stray 'f'/'0' string from a driver
    // change must not read as permission.
    state.isPlatformAdmin = 'false' as unknown as boolean;
    const res = await resetGymOwnerPassword(RESET_INPUT);
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(adminTouched).not.toHaveBeenCalled();
  });

  it('validates input BEFORE reaching the privileged client', async () => {
    state.isPlatformAdmin = true;
    for (const bad of [{ gymId: '', ownerUserId: 'o' }, { gymId: 'g', ownerUserId: '' }, {} as never]) {
      const res = await resetGymOwnerPassword(bad as never);
      expect(res).toEqual({ ok: false, error: 'invalid-input' });
    }
    expect(adminTouched, 'malformed input never reaches the admin client').not.toHaveBeenCalled();
  });

  it('LETS A REAL PLATFORM ADMIN THROUGH — the gate is not simply always-deny', async () => {
    state.isPlatformAdmin = true;
    // The sentinel proves the privileged path was entered; nothing real is mutated.
    await expect(resetGymOwnerPassword(RESET_INPUT)).rejects.toThrow('REACHED_ADMIN');
    expect(adminTouched).toHaveBeenCalled();
  });
});

describe('OWNER-RESET · lookupGymOwner — the same gate on the read side', () => {
  it('refuses a non-platform-admin (the confirmation step leaks no account info)', async () => {
    // The lookup returns a name and a masked email. That is cross-tenant identity
    // data, so it needs the same gate as the write — not a weaker one.
    state.user = { id: 'gym-owner-9', email: 'owner@proline.lb' };
    state.isPlatformAdmin = false;
    const res = await lookupGymOwner({ gymId: 'gym-1' });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(adminTouched).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    state.user = null;
    expect(await lookupGymOwner({ gymId: 'gym-1' })).toEqual({ ok: false, error: 'unauthorized' });
    expect(adminTouched).not.toHaveBeenCalled();
  });

  it('lets a real platform admin through', async () => {
    state.isPlatformAdmin = true;
    await expect(lookupGymOwner({ gymId: 'gym-1' })).rejects.toThrow('REACHED_ADMIN');
    expect(adminTouched).toHaveBeenCalled();
  });
});
