import { test, expect } from '@playwright/test'
import { gymSlug } from './helpers'

/**
 * INVOICE-SEQ — invoice numbering is race-safe (audit P1).
 *
 * generate_invoice_number() numbered with COUNT(*)+1 per gym+year while
 * invoice_number is UNIQUE — two CONCURRENT issuances (two desks, or a desk
 * issue overlapping the renewal tick) computed the same COUNT and collided:
 * the loser got a raw 23505 and a failed money op. 000076 serializes the
 * numbering with a per-(gym,year) transaction advisory lock.
 *
 * This guard fires TWO SIMULTANEOUS inserts (Promise.all → the same BEFORE
 * INSERT trigger every issuance path uses) via the service role and asserts
 * BOTH succeed with DISTINCT, SEQUENTIAL numbers. Pre-fix: one reliably 23505s.
 * Node-side (no browser); the fixtures are then CANCELLED (never deleted —
 * COUNT(*)+1 numbering must never lose rows, see 000067).
 */
const URL_ = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY(),
      Authorization: `Bearer ${KEY()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

test('INVOICE-SEQ · two simultaneous issuances both succeed with distinct sequential numbers', async () => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, 'needs the service role key (CI e2e env)')
  test.setTimeout(60_000)

  // Resolve the run gym + any student in it.
  const gymRes = await rest(`gyms?slug=eq.${encodeURIComponent(gymSlug())}&select=id`)
  const [gym] = await gymRes.json()
  expect(gym?.id, 'run gym resolves').toBeTruthy()
  const stuRes = await rest(`students?gym_id=eq.${gym.id}&select=id&limit=1`)
  const [stu] = await stuRes.json()
  expect(stu?.id, 'a student exists in the run gym').toBeTruthy()

  const body = JSON.stringify({
    gym_id: gym.id,
    student_id: stu.id,
    invoice_type: 'other',
    amount_usd: 1,
    total_usd: 1,
    due_date: new Date().toISOString().slice(0, 10),
    notes_en: 'INVOICE-SEQ concurrency guard',
  })
  const issue = () => rest('invoices?select=id,invoice_number', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body,
  })

  // The race: both inserts in flight at once → the same numbering trigger.
  const [r1, r2] = await Promise.all([issue(), issue()])
  const t1 = await r1.text()
  const t2 = await r2.text()
  expect(r1.status, `issuance #1 succeeds (got ${r1.status}: ${t1.slice(0, 120)})`).toBe(201)
  expect(r2.status, `issuance #2 succeeds (pre-fix: 23505 duplicate invoice_number — got ${r2.status}: ${t2.slice(0, 120)})`).toBe(201)

  const [inv1] = JSON.parse(t1)
  const [inv2] = JSON.parse(t2)
  const FORMAT = /^INV-[A-Z0-9-]+-\d{4}-(\d{5})$/
  expect(inv1.invoice_number, 'number #1 keeps the format').toMatch(FORMAT)
  expect(inv2.invoice_number, 'number #2 keeps the format').toMatch(FORMAT)
  expect(inv1.invoice_number, 'numbers are DISTINCT').not.toBe(inv2.invoice_number)
  const seq1 = parseInt(inv1.invoice_number.match(FORMAT)![1], 10)
  const seq2 = parseInt(inv2.invoice_number.match(FORMAT)![1], 10)
  expect(Math.abs(seq1 - seq2), 'numbers are SEQUENTIAL (n and n+1)').toBe(1)

  // Cleanup: CANCEL (never delete) so the $1 fixtures never surface as open
  // balances for other specs. Cancelled rows still count toward numbering.
  const patch = await rest(`invoices?id=in.(${inv1.id},${inv2.id})`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
  })
  expect(patch.ok, 'fixtures cancelled').toBe(true)
})
