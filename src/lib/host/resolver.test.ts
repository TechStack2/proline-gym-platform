import { describe, it, expect } from 'vitest'
import { classifyHost, normalizeHost, type HostClass } from './resolver'

/**
 * PRAXELLA-DOOR R1 — the host resolver's full matrix. classifyHost is pure, so
 * the vendor-host list + root domain are pinned here (no env / DB) and every
 * routing branch is asserted: vendor apex/www, *.praxella.com subdomain slug,
 * malformed subdomain → redirect, custom domain / Railway / localhost → default.
 */
const CFG = { vendorHosts: ['praxella.com', 'www.praxella.com'], rootDomain: 'praxella.com' }
const c = (host: string | null | undefined) => classifyHost(host, CFG)

describe('classifyHost', () => {
  it('(i) exact vendor apex + www → vendor', () => {
    expect(c('praxella.com')).toEqual<HostClass>({ kind: 'vendor' })
    expect(c('www.praxella.com')).toEqual<HostClass>({ kind: 'vendor' })
  })

  it('(i) is case- and port-insensitive', () => {
    expect(c('PRAXELLA.COM')).toEqual<HostClass>({ kind: 'vendor' })
    expect(c('praxella.com:443')).toEqual<HostClass>({ kind: 'vendor' })
    expect(c('  Www.Praxella.com  ')).toEqual<HostClass>({ kind: 'vendor' })
  })

  it('(iii) <slug>.praxella.com → subdomain slug', () => {
    expect(c('acme.praxella.com')).toEqual<HostClass>({ kind: 'subdomain', slug: 'acme' })
    expect(c('proline-gym.praxella.com')).toEqual<HostClass>({ kind: 'subdomain', slug: 'proline-gym' })
    expect(c('acme.praxella.com:3000')).toEqual<HostClass>({ kind: 'subdomain', slug: 'acme' })
  })

  it('(iii) malformed / multi-level subdomain → subdomain-invalid (clean redirect, not 500)', () => {
    expect(c('foo.bar.praxella.com')).toEqual<HostClass>({ kind: 'subdomain-invalid' }) // multi-level
    expect(c('-bad.praxella.com')).toEqual<HostClass>({ kind: 'subdomain-invalid' })    // leading hyphen
    expect(c('bad-.praxella.com')).toEqual<HostClass>({ kind: 'subdomain-invalid' })    // trailing hyphen
    expect(c('.praxella.com')).toEqual<HostClass>({ kind: 'subdomain-invalid' })        // empty label
  })

  it('(iii) www subdomain resolves to the vendor landing', () => {
    expect(c('www.praxella.com')).toEqual<HostClass>({ kind: 'vendor' })
  })

  it('(iv) custom domain / Railway host / localhost → other (custom-domain lookup else DEFAULT)', () => {
    expect(c('proline.up.railway.app')).toEqual<HostClass>({ kind: 'other', host: 'proline.up.railway.app' })
    expect(c('gym.example.com')).toEqual<HostClass>({ kind: 'other', host: 'gym.example.com' })
    expect(c('localhost')).toEqual<HostClass>({ kind: 'other', host: 'localhost' })
    expect(c('localhost:3000')).toEqual<HostClass>({ kind: 'other', host: 'localhost' })
  })

  it('empty / absent host → other with null host (→ DEFAULT downstream)', () => {
    expect(c(null)).toEqual<HostClass>({ kind: 'other', host: null })
    expect(c(undefined)).toEqual<HostClass>({ kind: 'other', host: null })
    expect(c('')).toEqual<HostClass>({ kind: 'other', host: null })
    expect(c('   ')).toEqual<HostClass>({ kind: 'other', host: null })
  })

  it('forceVendor (?vendor=1 dev preview) short-circuits to vendor regardless of host', () => {
    expect(classifyHost('localhost:3000', { ...CFG, forceVendor: true })).toEqual<HostClass>({ kind: 'vendor' })
    expect(classifyHost('gym.example.com', { ...CFG, forceVendor: true })).toEqual<HostClass>({ kind: 'vendor' })
  })

  it('a look-alike domain that merely CONTAINS the root is NOT a subdomain', () => {
    // "notpraxella.com" ends with "praxella.com" textually but not with ".praxella.com".
    expect(c('notpraxella.com')).toEqual<HostClass>({ kind: 'other', host: 'notpraxella.com' })
  })
})

describe('normalizeHost', () => {
  it('lowercases, trims, drops the port, and nulls empties', () => {
    expect(normalizeHost('  Foo.PRAXELLA.com:8080 ')).toBe('foo.praxella.com')
    expect(normalizeHost(null)).toBeNull()
    expect(normalizeHost('')).toBeNull()
    expect(normalizeHost('   ')).toBeNull()
  })
})
