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
const state = { callerRole: 'receptionist', phoneHolder: null as string | null }
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
    // MJ-1: the credential-invariant checker (credentialed_phone_owner). Returns the
    // configured holder name (or null when the phone is free to credential).
    rpc: async (fn: string) => (fn === 'credentialed_phone_owner' ? { data: state.phoneHolder } : { data: null }),
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
  state.phoneHolder = null
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

describe('MJ-1 credential invariant (one login per phone per gym)', () => {
  it('blocks the invite when another CREDENTIALED profile already holds the phone — no privileged call', async () => {
    state.callerRole = 'owner'
    state.phoneHolder = 'Rana Mourad' // a credentialed profile already owns this number
    const res = await inviteToPortal({ profileId: 'target-1', role: 'parent' })
    expect(res).toEqual({ ok: false, error: 'phone_taken', holder: 'Rana Mourad' })
    expect(adminTouched, 'GoTrue is never touched when the phone is taken').not.toHaveBeenCalled()
  })

  it('lets the invite through when the phone is free (login-less holders do not count) → reaches the privileged path', async () => {
    state.callerRole = 'owner'
    state.phoneHolder = null // no CREDENTIALED holder → free to issue
    await expect(inviteToPortal({ profileId: 'target-1', role: 'parent' }))
      .rejects.toThrow('REACHED_ADMIN') // passed the invariant, reached GoTrue
    expect(adminTouched).toHaveBeenCalled()
  })
})
