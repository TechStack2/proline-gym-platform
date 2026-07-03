import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * STAFF-INVITE privilege-escalation guard (auditor review).
 *
 * The TS union on inviteToPortal's `role` is compile-time only — a crafted POST
 * to the server action can carry ANY string. These tests pin the RUNTIME gates:
 *   · role:'owner' is NEVER invitable (any caller) → 'forbidden', and the
 *     privileged admin client is never touched (no auth user, no user_roles row).
 *   · receptionist callers cannot grant receptionist/head_coach (existing gate).
 *   · owner callers CAN grant receptionist (the gate passes → the admin path runs).
 *
 * The supabase server/admin clients are mocked: the admin client THROWS a
 * sentinel on first use, so "reached the privileged path" is observable and
 * nothing real is ever created.
 */
const state = { callerRole: 'receptionist' }
const adminTouched = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'caller-1' } } }) },
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => {
          if (table === 'user_roles') return { data: { role: state.callerRole, gym_id: 'gym-1' } }
          if (table === 'profiles') return { data: { gym_id: 'gym-1', phone: '+96170000001' } }
          return { data: null }
        },
      }
      return q
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: () => { adminTouched(); throw new Error('REACHED_ADMIN') } } },
    from: () => { adminTouched(); throw new Error('REACHED_ADMIN') },
  }),
}))

import { inviteToPortal } from './invite'

beforeEach(() => {
  adminTouched.mockClear()
  state.callerRole = 'receptionist'
})

describe('inviteToPortal runtime role allowlist', () => {
  it("rejects role:'owner' from a receptionist — no privileged call, no user_roles row", async () => {
    const res = await inviteToPortal({ profileId: 'target-1', role: 'owner' as any })
    expect(res).toEqual({ ok: false, error: 'forbidden' })
    expect(adminTouched, 'the admin client is never touched').not.toHaveBeenCalled()
  })

  it("rejects role:'owner' even from an OWNER caller — owner is never invitable", async () => {
    state.callerRole = 'owner'
    const res = await inviteToPortal({ profileId: 'target-1', role: 'owner' as any })
    expect(res).toEqual({ ok: false, error: 'forbidden' })
    expect(adminTouched).not.toHaveBeenCalled()
  })

  it('rejects arbitrary junk roles (runtime, not just compile-time)', async () => {
    state.callerRole = 'owner'
    const res = await inviteToPortal({ profileId: 'target-1', role: 'super_admin' as any })
    expect(res).toEqual({ ok: false, error: 'forbidden' })
    expect(adminTouched).not.toHaveBeenCalled()
  })

  it('keeps the staff-grant gate: a receptionist cannot grant head_coach', async () => {
    const res = await inviteToPortal({ profileId: 'target-1', role: 'head_coach' })
    expect(res).toEqual({ ok: false, error: 'forbidden' })
    expect(adminTouched).not.toHaveBeenCalled()
  })

  it('keeps the staff-grant gate: a receptionist cannot grant receptionist', async () => {
    const res = await inviteToPortal({ profileId: 'target-1', role: 'receptionist' })
    expect(res).toEqual({ ok: false, error: 'forbidden' })
    expect(adminTouched).not.toHaveBeenCalled()
  })

  it('an OWNER granting receptionist passes the gates (reaches the privileged path)', async () => {
    state.callerRole = 'owner'
    await expect(inviteToPortal({ profileId: 'target-1', role: 'receptionist' }))
      .rejects.toThrow('REACHED_ADMIN') // the sentinel: both gates passed
    expect(adminTouched).toHaveBeenCalled()
  })
})
