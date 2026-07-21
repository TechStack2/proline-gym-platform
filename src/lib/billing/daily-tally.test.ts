import { describe, it, expect, vi } from 'vitest'
import { getDailyTally } from './daily-tally'

/**
 * MONEY-TALLY — the contract that replaced the silent-empty drawer.
 *
 * The defect was not a wrong number; it was a TYPE. `getDailyTally` returned a bare
 * Map and, on failure, returned an EMPTY one — so "nothing was collected today" and
 * "we could not find out" were the same value, and every consumer rendered the
 * reassuring one. These tests pin the discriminated result, because that is the thing
 * that makes the old rendering impossible to write again.
 *
 * The failure path is proven HERE rather than in e2e deliberately: the read happens
 * inside a React Server Component, so the Supabase call never crosses the browser and
 * Playwright has nothing to intercept. A spec could only force it by breaking the
 * database for every other test on the shard. The e2e half of the proof is the
 * opposite direction — money-lbp asserts the RPC's own authorization at the HTTP
 * layer, where it IS reachable.
 */
type RpcArgs = { p_gym_id: string | null | undefined; p_date: string }

function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async (_fn: string, _args: RpcArgs) => result)
  return { client: { rpc } as never, rpc }
}

const GYM = '11111111-1111-1111-1111-111111111111'

describe('MONEY-TALLY · getDailyTally', () => {
  it('sums per method on success', async () => {
    const { client } = clientReturning({
      data: [
        { payment_method: 'cash_lbp', usd: 50, lbp: 4_450_000 },
        { payment_method: 'cash_usd', usd: 100, lbp: 0 },
      ],
      error: null,
    })
    const res = await getDailyTally(client, { gymId: GYM })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.tally.get('cash_lbp')).toEqual({ usd: 50, lbp: 4_450_000 })
    expect(res.tally.get('cash_usd')).toEqual({ usd: 100, lbp: 0 })
  })

  it('reports a FAILED read as a failure — never as an empty drawer', async () => {
    // The exact shape that caused the incident: a statement timeout.
    const { client } = clientReturning({
      data: null,
      error: { message: 'canceling statement due to statement timeout' },
    })
    const res = await getDailyTally(client, { gymId: GYM })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('statement timeout')
    // …and there is no `tally` to render. A consumer CANNOT reach a Map on this
    // branch, which is what makes the silent-empty rendering unwritable.
    expect('tally' in res).toBe(false)
  })

  it('distinguishes a genuine ZERO from a failure', async () => {
    const { client } = clientReturning({ data: [], error: null })
    const res = await getDailyTally(client, { gymId: GYM })
    expect(res.ok, 'a day with no payments is a SUCCESS carrying an empty tally').toBe(true)
    if (!res.ok) return
    expect(res.tally.size).toBe(0)
  })

  it('refuses to read without a gym in scope, and never calls the RPC', async () => {
    // An unscoped tally would be a cross-tenant read, and "no payments today" would
    // be a claim we have no basis for.
    for (const gymId of [undefined, null, '']) {
      const { client, rpc } = clientReturning({ data: [], error: null })
      const res = await getDailyTally(client, { gymId })
      expect(res.ok).toBe(false)
      expect(rpc, 'no gym → no query at all').not.toHaveBeenCalled()
    }
  })

  it('passes the day through unchanged and defaults to today (UTC)', async () => {
    const { client, rpc } = clientReturning({ data: [], error: null })
    await getDailyTally(client, { gymId: GYM, date: '2026-03-09' })
    expect(rpc).toHaveBeenCalledWith('get_daily_tally', { p_gym_id: GYM, p_date: '2026-03-09' })

    const { client: c2, rpc: rpc2 } = clientReturning({ data: [], error: null })
    await getDailyTally(c2, { gymId: GYM })
    // The same boundary the PostgREST filter used before the RPC existed.
    expect(rpc2.mock.calls[0][1].p_date).toBe(new Date().toISOString().slice(0, 10))
  })
})
