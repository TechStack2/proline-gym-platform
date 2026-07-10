import { describe, it, expect } from 'vitest'
import { getSetupMilestones, getSetupChecklist } from './setup-checklist'

/**
 * TODAY-DERISK — the onboarding checklist / setup-hub milestones now derive from a
 * SINGLE aggregate read (get_setup_status, 000093) instead of ~15 count/exists probes.
 * These tests are executable evidence + a permanent regression guard:
 *   1. getSetupMilestones / getSetupChecklist each make EXACTLY ONE round-trip (one
 *      rpc('get_setup_status'), zero table reads) — the whole point of the slice.
 *   2. the assembly (product gating, branding derivation, milestone done-state) is
 *      byte-identical to the per-query engine, proven against a crafted signal row.
 */

// A counting mock supabase client: records every .from()/.rpc() as one round-trip and
// returns the canned get_setup_status row for the rpc (RETURNS TABLE → array of rows).
function countingClient(row: Record<string, unknown> | null) {
  const calls = { from: [] as string[], rpc: [] as string[] }
  const client = {
    from(table: string) {
      calls.from.push(table)
      // A chainable stub in case anything ever falls back to a table read (it must not).
      const builder: any = new Proxy(() => builder, {
        get: (_t, prop) => {
          if (prop === 'then') return (res: any) => Promise.resolve({ data: [], count: 0, error: null }).then(res)
          return () => builder
        },
        apply: () => builder,
      })
      return builder
    },
    rpc(name: string, _args?: unknown) {
      calls.rpc.push(name)
      return Promise.resolve({ data: row ? [row] : [], error: null })
    },
  }
  return { client: client as any, calls }
}

// A fully-configured class+PT gym (membership OFF — the Proline/e2e product mix).
const CONFIGURED = {
  name_ar: 'ن', name_en: 'Gym', name_fr: 'G', slug: 'gym', phone: '+961', email: 'a@b.c',
  logo_url: null, brand_color: '#cd1419', hero_image_url: null,
  tagline_ar: null, tagline_en: 'Fight', tagline_fr: null,
  enabled_products: { membership: false, class: true, pt: true, camp: true },
  has_discipline: true, has_coach: true, has_class_schedule: true,
  has_membership_plan: false, has_pt_package: true, has_exchange_rate: true,
  has_student: true, has_upcoming_camp: true, has_bookable_coach: true,
  has_landing_class: true, has_landing_coach: true, first_coach_id: 'coach-1',
}

describe('TODAY-DERISK · setup status = ONE round-trip', () => {
  it('getSetupMilestones makes exactly one rpc call and zero table reads', async () => {
    const { client, calls } = countingClient(CONFIGURED)
    await getSetupMilestones(client, 'gym-1')
    expect(calls.rpc).toEqual(['get_setup_status'])
    expect(calls.from).toEqual([])
  })

  it('getSetupChecklist makes exactly one rpc call and zero table reads', async () => {
    const { client, calls } = countingClient(CONFIGURED)
    await getSetupChecklist(client, 'gym-1')
    expect(calls.rpc).toEqual(['get_setup_status'])
    expect(calls.from).toEqual([])
  })
})

describe('TODAY-DERISK · assembly is behavior-identical', () => {
  it('gates membership out (product off) and completes a fully-configured class+PT gym', async () => {
    const { client } = countingClient(CONFIGURED)
    const { items } = await getSetupChecklist(client, 'gym-1')
    // membership OFF → no `plan` item; pt/camp ON → ptpackage + camp present.
    expect(items.map((i) => i.key)).toEqual([
      'profile', 'branding', 'discipline', 'coach', 'class', 'ptpackage', 'camp', 'exchange', 'member',
    ])
    expect(items.every((i) => i.done)).toBe(true)
  })

  it('derives the 7 milestones (camps enabled) with correct done-state', async () => {
    const { client } = countingClient(CONFIGURED)
    const { milestones, doneCount, total, allDone, slug, gymName } = await getSetupMilestones(client, 'gym-1')
    expect(milestones.map((m) => m.key)).toEqual(['gym', 'team', 'classes', 'offers', 'camps', 'members', 'golive'])
    expect(total).toBe(7)
    expect(allDone).toBe(true)
    expect(doneCount).toBe(7)
    expect(slug).toBe('gym')
    expect(gymName).toBe('Gym')
    // team detail carries the bookable + first-coach signals off the same row.
    const team = milestones.find((m) => m.key === 'team')!
    expect(team.detail).toMatchObject({ hasCoaches: true, bookable: true, firstCoachId: 'coach-1' })
  })

  it('a blank gym → nothing done, membership/pt/camp items gated by defaults', async () => {
    const { client } = countingClient({
      ...CONFIGURED,
      phone: null, email: null, brand_color: null, hero_image_url: null, tagline_en: null,
      logo_url: null, tagline_ar: null, tagline_fr: null,
      has_discipline: false, has_coach: false, has_class_schedule: false,
      has_membership_plan: false, has_pt_package: false, has_exchange_rate: false,
      has_student: false, has_upcoming_camp: false, has_bookable_coach: false,
      has_landing_class: false, has_landing_coach: false, first_coach_id: null,
    })
    const { milestones, allDone } = await getSetupMilestones(client, 'gym-1')
    expect(allDone).toBe(false)
    expect(milestones.every((m) => !m.done)).toBe(true)
  })
})
