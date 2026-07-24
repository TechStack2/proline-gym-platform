import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AUTH-COOKIE-REDIRECT (P1) — the middleware must not drop the rotated Supabase
 * session cookies on a redirect.
 *
 * `getUser()` rotates the refresh token and writes the NEW sb-* cookies onto
 * `supabaseResponse` via the client's `setAll`. Before the fix, every redirect
 * branch returned a BARE `NextResponse.redirect(url)` that carried none of them, so
 * the browser kept the already-rotated token → the next request 400s
 * (`refresh_token_already_used`) and the session dies. These tests pin the
 * invariant that the fix guarantees: a middleware redirect issued after a rotation
 * carries the freshly-rotated cookies.
 *
 * A full GoTrue rotation can't run on the unit stack, so (per the slice) we assert
 * the cookie-propagation invariant directly: the helper in isolation, AND the whole
 * `updateSession` with the Supabase client stubbed at the @supabase/ssr boundary so
 * `getUser` triggers a real `setAll` (the rotation) and returns a user that forces
 * each redirect branch.
 */

// ── The @supabase/ssr boundary: getUser triggers setAll (the rotation) then answers. ──
let mockUser: any = null
let rotateOnGetUser = true
const ROTATED = [
  { name: 'sb-access-token', value: 'ROTATED-ACCESS', options: { httpOnly: true, path: '/', sameSite: 'lax' } },
  { name: 'sb-refresh-token', value: 'ROTATED-REFRESH', options: { httpOnly: true, path: '/' } },
]

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, config: any) => ({
    auth: {
      getUser: async () => {
        // Simulate GoTrue rotating the refresh token: the client writes the new
        // cookies onto supabaseResponse exactly as the real setAll does.
        if (rotateOnGetUser) config.cookies.setAll(ROTATED)
        return { data: { user: mockUser } }
      },
    },
    // role-home branches read user_roles.role
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'owner' } }) }) }) }),
  }),
}))
vi.mock('@/lib/auth/platform-admin', () => ({ isPlatformAdmin: async () => false, VENDOR_HOME: '/vendor' }))

import { NextRequest, NextResponse } from 'next/server'
import { redirectWithSession, updateSession } from './middleware'

beforeEach(() => {
  mockUser = null
  rotateOnGetUser = true
})

describe('redirectWithSession — the helper invariant', () => {
  it('copies the source response cookies (value + options) onto the redirect', () => {
    const from = NextResponse.next()
    from.cookies.set('sb-access-token', 'ROTATED-ACCESS', { httpOnly: true, path: '/', sameSite: 'lax' })
    from.cookies.set('sb-refresh-token', 'ROTATED-REFRESH', { httpOnly: true, path: '/' })

    const redirect = redirectWithSession(new URL('http://localhost/en/portal'), from)

    expect(redirect.status).toBe(307)
    expect(redirect.headers.get('location')).toContain('/en/portal')
    expect(redirect.cookies.get('sb-access-token')?.value).toBe('ROTATED-ACCESS')
    expect(redirect.cookies.get('sb-refresh-token')?.value).toBe('ROTATED-REFRESH')
    // options survive (httpOnly/path are what make the cookie usable + scoped)
    expect(redirect.cookies.get('sb-access-token')?.httpOnly).toBe(true)
    expect(redirect.cookies.get('sb-access-token')?.path).toBe('/')
    // and the browser-facing Set-Cookie header actually carries them
    const setCookie = redirect.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('ROTATED-ACCESS')
    expect(setCookie).toContain('ROTATED-REFRESH')
  })

  it('the bug it fixes: a BARE redirect carries none of them', () => {
    const from = NextResponse.next()
    from.cookies.set('sb-access-token', 'ROTATED-ACCESS', { path: '/' })
    const bare = NextResponse.redirect(new URL('http://localhost/en/portal'))
    expect(bare.cookies.get('sb-access-token')).toBeUndefined()
  })
})

describe('updateSession — every redirect branch carries the rotated session', () => {
  it('forced-change gate → /onboarding redirect carries the rotated cookies', async () => {
    mockUser = { id: 'u1', app_metadata: { must_change_password: true } }
    const res = await updateSession(new NextRequest('http://localhost/en/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/en/onboarding')
    expect(res.cookies.get('sb-access-token')?.value).toBe('ROTATED-ACCESS')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('ROTATED-REFRESH')
  })

  it('PWA landing-root → role-home redirect carries the rotated cookies', async () => {
    mockUser = { id: 'u1', app_metadata: {} }
    const res = await updateSession(new NextRequest('http://localhost/en'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/en/dashboard') // owner role
    expect(res.cookies.get('sb-access-token')?.value).toBe('ROTATED-ACCESS')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('ROTATED-REFRESH')
  })

  it('unauthenticated on a protected route → /auth/login redirect carries the (cleared) cookies', async () => {
    mockUser = null // no session; getUser still ran setAll (session-clearing cookies)
    const res = await updateSession(new NextRequest('http://localhost/en/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/en/auth/login')
    // whatever setAll wrote must survive the redirect (the invariant is unconditional)
    expect(res.cookies.get('sb-access-token')?.value).toBe('ROTATED-ACCESS')
  })

  it('the non-redirect pass-through still returns supabaseResponse (unchanged behavior)', async () => {
    mockUser = { id: 'u1', app_metadata: {} }
    // a deep authed page that matches no redirect branch → pass through
    const res = await updateSession(new NextRequest('http://localhost/en/students/abc'))
    expect(res.status).toBe(200)
    expect(res.cookies.get('sb-access-token')?.value).toBe('ROTATED-ACCESS')
  })
})
