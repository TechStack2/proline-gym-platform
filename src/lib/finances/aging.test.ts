import { describe, it, expect, vi } from 'vitest'
import { getGymOutstandingAging } from './aging'

/**
 * OUTSTANDING-AGING — the same discriminated-result contract MONEY-OUTSTANDING
 * established, on the aging grid. The RPC's own authorization + the truncation
 * direction are proven at the seeded-data layer in e2e/outstanding-aging.spec.ts (this
 * read happens inside a Server Component); here we pin the fold + the fail-loud type.
 */
type RpcArgs = { p_gym_id: string | null | undefined }

function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async (_fn: string, _args: RpcArgs) => result)
  return { client: { rpc } as never, rpc }
}

const GYM = '11111111-1111-1111-1111-111111111111'

describe('OUTSTANDING-AGING · getGymOutstandingAging', () => {
  it('folds the RPC rows into the four buckets in fixed order, zero-filling gaps', async () => {
    const { client } = clientReturning({
      data: [
        { bucket: 'd60_plus', n_invoices: 2, usd: 200, lbp: 1_000_000 },
        { bucket: 'current', n_invoices: 5, usd: 500, lbp: 0 },
      ],
      error: null,
    })
    const res = await getGymOutstandingAging(client, { gymId: GYM })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.buckets.map((b) => b.key)).toEqual(['current', 'd1_30', 'd31_60', 'd60_plus'])
    expect(res.buckets[0]).toEqual({ key: 'current', count: 5, usd: 500, lbp: 0 })
    expect(res.buckets[1]).toEqual({ key: 'd1_30', count: 0, usd: 0, lbp: 0 }) // zero-filled
    expect(res.buckets[3]).toEqual({ key: 'd60_plus', count: 2, usd: 200, lbp: 1_000_000 })
  })

  it('reports a FAILED read as a failure — never as four empty buckets', async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: 'canceling statement due to statement timeout' },
    })
    const res = await getGymOutstandingAging(client, { gymId: GYM })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('statement timeout')
    expect('buckets' in res).toBe(false)
  })

  it('distinguishes a genuine "nothing overdue" from a failure', async () => {
    const { client } = clientReturning({ data: [], error: null })
    const res = await getGymOutstandingAging(client, { gymId: GYM })
    expect(res.ok, 'a gym that owes nothing is a SUCCESS with four zero buckets').toBe(true)
    if (!res.ok) return
    expect(res.buckets).toEqual([
      { key: 'current', count: 0, usd: 0, lbp: 0 },
      { key: 'd1_30', count: 0, usd: 0, lbp: 0 },
      { key: 'd31_60', count: 0, usd: 0, lbp: 0 },
      { key: 'd60_plus', count: 0, usd: 0, lbp: 0 },
    ])
  })

  it('refuses to read without a gym in scope, and never calls the RPC', async () => {
    for (const gymId of [undefined, null, '']) {
      const { client, rpc } = clientReturning({ data: [], error: null })
      const res = await getGymOutstandingAging(client, { gymId })
      expect(res.ok).toBe(false)
      expect(rpc, 'no gym → no query at all').not.toHaveBeenCalled()
    }
  })

  it('passes the gym through as the assertion argument', async () => {
    const { client, rpc } = clientReturning({ data: [], error: null })
    await getGymOutstandingAging(client, { gymId: GYM })
    expect(rpc).toHaveBeenCalledWith('get_gym_outstanding_aging', { p_gym_id: GYM })
  })

  it('rounds the folded USD to cents and ignores an unknown bucket label', async () => {
    const { client } = clientReturning({
      data: [
        { bucket: 'current', n_invoices: 1, usd: 0.1, lbp: 0 },
        { bucket: 'current', n_invoices: 1, usd: 0.2, lbp: 0 },
        { bucket: 'nonsense', n_invoices: 9, usd: 999, lbp: 0 }, // contract drift → dropped
      ],
      error: null,
    })
    const res = await getGymOutstandingAging(client, { gymId: GYM })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.buckets[0].usd).toBe(0.3)
    expect(res.buckets.reduce((s, b) => s + b.count, 0)).toBe(2) // the nonsense row is ignored
  })
})
