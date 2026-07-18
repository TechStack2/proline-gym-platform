import { describe, it, expect, afterEach } from 'vitest'
import { dispatchPendingPush } from './dispatch'

/**
 * The no-keys no-op: with neither a real VAPID keypair nor the test sink, the
 * drain is inert — it reports transport 'none', considers nothing, and (critically)
 * does NOT stamp push_sent_at, so pending rows deliver once keys are configured.
 * The unit/lint env sets no VAPID keys, so the plain call proves the default state;
 * forceNone proves it even when a sink IS present.
 */
describe('dispatchPendingPush — no-op paths', () => {
  const OLD = process.env.PUSH_TEST_SINK
  afterEach(() => { process.env.PUSH_TEST_SINK = OLD })

  it('no VAPID keys + no sink → transport none, nothing considered/stamped, DB untouched', async () => {
    delete process.env.PUSH_TEST_SINK
    const r = await dispatchPendingPush()
    expect(r).toEqual({ transport: 'none', considered: 0, dispatched: [], pruned: [], stamped: 0 })
  })

  it('forceNone short-circuits even with the sink on (no delivery, no stamp)', async () => {
    process.env.PUSH_TEST_SINK = '1'
    const r = await dispatchPendingPush({ forceNone: true })
    expect(r.transport).toBe('none')
    expect(r.considered).toBe(0)
    expect(r.stamped).toBe(0)
  })
})
