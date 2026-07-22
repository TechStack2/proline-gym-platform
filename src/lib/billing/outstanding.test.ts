import { describe, it, expect, vi } from 'vitest'
import { getGymOutstanding } from './outstanding'

/**
 * MONEY-OUTSTANDING — the same contract MONEY-TALLY established, on the obligation
 * side of the ledger. The defect this replaces was a silently-truncatable number that,
 * on failure, would have rendered "$0 owed". These tests pin the discriminated result
 * and the group folding; the RPC's OWN authorization + the truncation direction are
 * proven at the HTTP / seeded-data layer in e2e/money-lbp.spec.ts, where they are
 * genuinely reachable (this read happens inside a Server Component).
 */
type RpcArgs = { p_gym_id: string | null | undefined }

function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async (_fn: string, _args: RpcArgs) => result)
  return { client: { rpc } as never, rpc }
}

const GYM = '11111111-1111-1111-1111-111111111111'

describe('MONEY-OUTSTANDING · getGymOutstanding', () => {
  it('folds the is_renewal groups into totals and the renewal subset', async () => {
    const { client } = clientReturning({
      data: [
        { is_renewal: false, n_invoices: 3, usd: 80, lbp: 7_120_000 },
        { is_renewal: true, n_invoices: 2, usd: 30, lbp: 2_670_000 },
      ],
      error: null,
    })
    const res = await getGymOutstanding(client, { gymId: GYM })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // all = both groups; renewal = the is_renewal group only (a subset of all).
    expect(res.totals.usd).toBe(110)
    expect(res.totals.lbp).toBe(9_790_000)
    expect(res.totals.invoiceCount).toBe(5)
    expect(res.totals.renewalUsd).toBe(30)
    expect(res.totals.renewalLbp).toBe(2_670_000)
    expect(res.totals.renewalCount).toBe(2)
  })

  it('reports a FAILED read as a failure — never as a zero balance', async () => {
    // The shape the old JS join could not represent: the read did not answer, so the
    // number is unknown, NOT zero.
    const { client } = clientReturning({
      data: null,
      error: { message: 'canceling statement due to statement timeout' },
    })
    const res = await getGymOutstanding(client, { gymId: GYM })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('statement timeout')
    // …and there is no `totals` to render. A consumer CANNOT reach a number on this
    // branch, which is what makes the falsely-small "$0 owed" unwritable.
    expect('totals' in res).toBe(false)
  })

  it('distinguishes a genuine ZERO owed from a failure', async () => {
    // No open invoices → the RPC returns no rows → a SUCCESS carrying zeros.
    const { client } = clientReturning({ data: [], error: null })
    const res = await getGymOutstanding(client, { gymId: GYM })
    expect(res.ok, 'a gym that owes nothing is a SUCCESS with zero totals').toBe(true)
    if (!res.ok) return
    expect(res.totals).toEqual({
      usd: 0, lbp: 0, invoiceCount: 0, renewalUsd: 0, renewalLbp: 0, renewalCount: 0,
    })
  })

  it('refuses to read without a gym in scope, and never calls the RPC', async () => {
    for (const gymId of [undefined, null, '']) {
      const { client, rpc } = clientReturning({ data: [], error: null })
      const res = await getGymOutstanding(client, { gymId })
      expect(res.ok).toBe(false)
      expect(rpc, 'no gym → no query at all').not.toHaveBeenCalled()
    }
  })

  it('passes the gym through as the assertion argument', async () => {
    const { client, rpc } = clientReturning({ data: [], error: null })
    await getGymOutstanding(client, { gymId: GYM })
    expect(rpc).toHaveBeenCalledWith('get_gym_outstanding', { p_gym_id: GYM })
  })

  it('rounds the folded USD to cents and LBP to whole piastres', async () => {
    // Two float balances that would drift if added without a final round.
    const { client } = clientReturning({
      data: [
        { is_renewal: false, n_invoices: 1, usd: 0.1, lbp: 0.4 },
        { is_renewal: false, n_invoices: 1, usd: 0.2, lbp: 0.4 },
      ],
      error: null,
    })
    const res = await getGymOutstanding(client, { gymId: GYM })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.totals.usd).toBe(0.3)
    expect(res.totals.lbp).toBe(1)
  })
})
