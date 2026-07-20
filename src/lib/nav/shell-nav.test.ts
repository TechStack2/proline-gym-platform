import { describe, expect, it } from 'vitest'
import { Sun } from 'lucide-react'
import { splitShellNav, type ShellNavEntry } from './shell-nav'
import { TabCapacityError } from './tab-capacity'
import { PORTAL_NAV } from '@/app/[locale]/portal/_components/PortalTabConfig'
import { COACH_NAV } from '@/app/[locale]/coach/_components/CoachTabConfig'

const entry = (key: string, mobilePrimary?: boolean): ShellNavEntry => ({
  key,
  icon: Sun,
  path: `/x/${key}`,
  mobilePrimary,
})

describe('splitShellNav (§4.4 one nav source per shell)', () => {
  it('splits primaries + More for mobile and ALL entries for the rail', () => {
    const { tabs, moreItems, railItems } = splitShellNav(
      [entry('a', true), entry('b', true), entry('c'), entry('d')],
      'test',
    )
    expect(tabs.map((t) => t.key)).toEqual(['a', 'b', 'more'])
    expect(moreItems.map((m) => m.key)).toEqual(['c', 'd'])
    expect(railItems.map((r) => r.key)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('throws the capacity error when >4 primaries are flagged (§2.2 law)', () => {
    expect(() =>
      splitShellNav(
        [entry('a', true), entry('b', true), entry('c', true), entry('d', true), entry('e', true)],
        'test',
      ),
    ).toThrow(TabCapacityError)
  })

  it('portal = the RULED 5: Home · Classes · Progress · Billing · More; rail carries all 6', () => {
    const { tabs, moreItems, railItems } = splitShellNav(PORTAL_NAV, 'portal')
    expect(tabs.map((t) => t.key)).toEqual(['home', 'classes', 'progress', 'billing', 'more'])
    expect(moreItems.map((m) => m.key)).toEqual(['pt', 'profile'])
    expect(railItems).toHaveLength(6)
  })

  it('coach = the RULED 5: Today · Attendance · Students · PT · More; rail carries all 6', () => {
    const { tabs, moreItems, railItems } = splitShellNav(COACH_NAV, 'coach')
    expect(tabs.map((t) => t.key)).toEqual(['today', 'attendance', 'students', 'pt', 'more'])
    expect(moreItems.map((m) => m.key)).toEqual(['trials', 'profile'])
    expect(railItems).toHaveLength(6)
  })
})
