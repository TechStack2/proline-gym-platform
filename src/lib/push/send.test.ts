import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}))
import webpush from 'web-push'
import { sendOne, isGoneStatus } from './send'

const payload = { title: 't', body: 'b', url: '/x', category: 'operational' as const, tag: 'proline-operational' }
const sub = { id: 's1', endpoint: 'https://push.example/e1', p256dh: 'k', auth: 'a' }

describe('isGoneStatus', () => {
  it('flags 404/410 (subscription gone) for pruning; nothing else', () => {
    expect(isGoneStatus(410)).toBe(true)
    expect(isGoneStatus(404)).toBe(true)
    expect(isGoneStatus(500)).toBe(false)
    expect(isGoneStatus(201)).toBe(false)
    expect(isGoneStatus(undefined)).toBe(false)
  })
})

describe('sendOne', () => {
  const OLD = process.env.PUSH_TEST_SINK
  afterEach(() => { process.env.PUSH_TEST_SINK = OLD; vi.clearAllMocks() })

  it('test-sink mode records the target without touching the network', async () => {
    process.env.PUSH_TEST_SINK = '1'
    const r = await sendOne(sub, payload)
    expect(r).toEqual({ endpoint: sub.endpoint, ok: true, prune: false })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('prunes a gone (410) subscription — and never throws', async () => {
    process.env.PUSH_TEST_SINK = ''
    ;(webpush.sendNotification as any).mockRejectedValueOnce({ statusCode: 410 })
    const r = await sendOne(sub, payload)
    expect(r.ok).toBe(false)
    expect(r.prune).toBe(true)
  })

  it('a transient (500) failure is NOT pruned', async () => {
    process.env.PUSH_TEST_SINK = ''
    ;(webpush.sendNotification as any).mockRejectedValueOnce({ statusCode: 500 })
    const r = await sendOne(sub, payload)
    expect(r.ok).toBe(false)
    expect(r.prune).toBe(false)
  })

  it('a successful send is ok and not pruned', async () => {
    process.env.PUSH_TEST_SINK = ''
    ;(webpush.sendNotification as any).mockResolvedValueOnce({ statusCode: 201 })
    const r = await sendOne(sub, payload)
    expect(r.ok).toBe(true)
    expect(r.prune).toBe(false)
  })
})
