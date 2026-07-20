import { describe, expect, it } from 'vitest'
import {
  STATIC_ACTION_ORIGINS,
  actionOrigins,
  envActionOrigins,
  isAllowedActionOrigin,
} from './action-origins'
// DRIFT-PIN: next.config.mjs cannot import TS, so its allowlist builder is a
// duplicate of this module's. Importing its named export here pins the two
// together — an edit to one without the other fails this suite.
import { serverActionAllowedOrigins } from '../../../next.config.mjs'

describe('PROXY-ACTIONS · action-origins', () => {
  it('env list is comma-separated, trimmed, lowercased, empty-safe', () => {
    expect(envActionOrigins(undefined)).toEqual([])
    expect(envActionOrigins('')).toEqual([])
    expect(envActionOrigins(' , ,')).toEqual([])
    expect(envActionOrigins(' Proline-Gym.com , www.proline-gym.com ')).toEqual([
      'proline-gym.com',
      'www.proline-gym.com',
    ])
  })

  it('full list = static + env', () => {
    expect(actionOrigins('a.example')).toEqual([...STATIC_ACTION_ORIGINS, 'a.example'])
  })

  it('matches exact hosts and *.praxella.com subdomains; rejects everything else', () => {
    const list = actionOrigins('proline-gym.com')
    expect(isAllowedActionOrigin('proline.up.railway.app', list)).toBe(true)
    expect(isAllowedActionOrigin('praxella.com', list)).toBe(true)
    expect(isAllowedActionOrigin('prolinegym.praxella.com', list)).toBe(true)
    expect(isAllowedActionOrigin('proline-gym.com', list)).toBe(true)
    expect(isAllowedActionOrigin('PROLINE-GYM.COM', list)).toBe(true)
    expect(isAllowedActionOrigin('localhost:3000', list)).toBe(true)
    // Rejected: unknown host, suffix tricks, the bare wildcard suffix's lookalikes.
    expect(isAllowedActionOrigin('evil.example.com', list)).toBe(false)
    expect(isAllowedActionOrigin('praxella.com.evil.example', list)).toBe(false)
    expect(isAllowedActionOrigin('notpraxella.com', list)).toBe(false)
    expect(isAllowedActionOrigin('', list)).toBe(false)
    expect(isAllowedActionOrigin(null, list)).toBe(false)
  })

  it('DRIFT-PIN: next.config.mjs serverActionAllowedOrigins === this module (same env)', () => {
    // Both read PRAXELLA_ACTION_ORIGINS from the ambient env at module load /
    // call time; compare under the CURRENT env so the pin holds everywhere.
    expect(serverActionAllowedOrigins).toEqual(actionOrigins())
  })
})
