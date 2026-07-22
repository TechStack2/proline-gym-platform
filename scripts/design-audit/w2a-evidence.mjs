#!/usr/bin/env node
/**
 * W2a/W2b evidence harness (slice tooling — no product code).
 *
 * Produces, for ALL FOUR shell surfaces (portal, coach, STAFF — W2b — and the
 * GUARDIAN portal variant, whose FamilyHome/KidDashboard render only for a
 * multi-kid parent session):
 *  1. §4.3 PARITY GATE — for every routed surface, the set of interactive
 *     `data-testid`s VISIBLE at 390 must be PRESENT (attached) at 1280 in the
 *     same locale/theme. Reported as numbers per route + a failing list.
 *  2. §4.1 XOR GATE — at <768 the tab bar is visible and the rail is not; at
 *     ≥768 the rail is visible and the tab bar is not (checked at 390/768/1024/1280).
 *     The staff rail keeps its historical `desktop-sidebar` testid (testid-
 *     stability) — per-shell `railSelector` handles that.
 *  3. §6.3 capture matrix — {en,ar} × {light,dark} × {390,1280} for the key
 *     surfaces, plus 768 + 1024 rail-state shots (en/light).
 *
 * Detail routes with dynamic ids (staff Member-360, guardian KidDashboard) are
 * resolved per session by following the first matching link from a list surface
 * (`dynamic` config below), then gated like any other route.
 *
 * Usage: node scripts/design-audit/w2a-evidence.mjs [--base http://localhost:3000]
 *          [--shells portal,coach]   (default: all four)
 * Env:   E2E_GYM_SLUG (default proline-gym-local), E2E_PASSWORD
 *        W2A_OUT (default: w2a-artifacts/)
 *
 * NB: a long-lived local `next start` degrades after a few hundred renders
 * (60s+ pages). For a full four-shell run, prefer two passes against a FRESH
 * server each: `--shells portal,coach` then `--shells staff,guardian`, and
 * merge the two results JSONs.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
const BASE = arg('base') || 'http://localhost:3000'
const OUT = process.env.W2A_OUT || 'w2a-artifacts'
const SLUG = process.env.E2E_GYM_SLUG || process.env.E2E_GYM_SLUG_BASE || 'proline-gym-local'
const PWD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
mkdirSync(join(OUT, 'shots'), { recursive: true })

const SHELLS = {
  portal: {
    role: 'student',
    routes: ['/portal', '/portal/classes', '/portal/classes?view=browse', '/portal/progress', '/portal/billing', '/portal/pt', '/portal/profile'],
    // W3a: every polished surface joins the capture matrix (§6.3).
    keyRoutes: ['/portal', '/portal/classes', '/portal/classes?view=browse', '/portal/billing', '/portal/progress', '/portal/profile'],
  },
  coach: {
    role: 'coach',
    routes: ['/coach', '/coach/attendance', '/coach/students', '/coach/trials', '/coach/pt', '/coach/profile'],
    keyRoutes: ['/coach', '/coach/attendance', '/coach/students', '/coach/trials', '/coach/profile'],
  },
  // W2b: the staff shell on the same contract. Its rail carries the historical
  // `desktop-sidebar` testid (testid-stability doctrine).
  staff: {
    role: 'owner',
    railSelector: '[data-testid="desktop-sidebar"]',
    routes: ['/today', '/inbox', '/students', '/schedule', '/money', '/coaches', '/settings', '/profile'],
    keyRoutes: ['/today', '/students', '/money', '/schedule'],
    // Member-360: the roster card navigates via onClick (role="link", no href) —
    // click the first card and take the landed URL.
    dynamic: [{ label: 'member-360', from: '/students', clickSelector: '[data-testid="student-card"]' }],
  },
  // W2b (auditor rider): the GUARDIAN surfaces — FamilyHome renders at /portal
  // for a multi-kid parent; KidDashboard behind the first kid chip.
  guardian: {
    role: 'parent',
    routes: ['/portal'],
    keyRoutes: ['/portal'],
    dynamic: [{ label: 'kid-dashboard', from: '/portal', linkSelector: 'a[href*="kid="]' }],
  },
}

async function login(browser, role) {
  // The local stack's GoTrue occasionally rejects a first sign-in with an empty
  // error (the known "[auth] email sign-in failed" blip) — retry the whole form
  // flow; a real credential problem still fails all attempts.
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    try {
      await goto(page, `${BASE}/en/auth/login`)
      await page.fill('#email', `${role}+${SLUG}@e2e.local`)
      await page.fill('#password', PWD)
      await page.click('button[type="submit"]')
      await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 })
      const state = await ctx.storageState()
      await ctx.close()
      return state
    } catch (e) {
      lastErr = e
      console.log(`login ${role}: attempt ${attempt} failed (${e.name}) — retrying`)
      await ctx.close()
    }
  }
  throw lastErr
}

const vis = async (page, sel) => page.locator(sel).filter({ visible: true })

/** Interactive testids: on elements that are links, buttons, inputs, selects, or have onclick/tabindex. */
async function testids(page, mode /* 'visible' | 'present' */) {
  return page.evaluate((m) => {
    const INTERACTIVE = (el) => {
      const tag = el.tagName.toLowerCase()
      if (['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag)) return true
      if (el.closest('a,button')) return true
      return el.hasAttribute('tabindex') || typeof el.onclick === 'function'
    }
    const isVisible = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return false
      const st = getComputedStyle(el)
      return st.display !== 'none' && st.visibility !== 'hidden'
    }
    const out = new Set()
    for (const el of document.querySelectorAll('[data-testid]')) {
      if (!INTERACTIVE(el)) continue
      if (m === 'visible' && !isVisible(el)) continue
      out.add(el.getAttribute('data-testid'))
    }
    return [...out].sort()
  }, mode)
}

// Slow-host tolerance: prod-build pages on a loaded laptop can exceed the 30s
// default; navigate on domcontentloaded (settle() below waits for networkidle).
// W3a: ONE retry on timeout — a single Docker-pressure stall was killing whole
// runs (an uncaught TimeoutError aborts every remaining shell's evidence).
const GOTO_TIMEOUT = Number(process.env.W2A_GOTO_TIMEOUT || 60_000)
async function goto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT })
  } catch (e) {
    if (e?.name !== 'TimeoutError') throw e
    console.log(`goto retry (${url}) after timeout`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT })
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
}

const results = { parity: [], xor: [], shots: [] }
const browser = await chromium.launch()

const onlyShells = (arg('shells') || '').split(',').map((s) => s.trim()).filter(Boolean)
const selected = Object.entries(SHELLS).filter(([name]) => !onlyShells.length || onlyShells.includes(name))

for (const [shell, cfg] of selected) {
  const storageState = await login(browser, cfg.role)

  // ── 0 · resolve dynamic detail routes (Member-360, KidDashboard) ──
  for (const dyn of cfg.dynamic || []) {
    const ctx = await browser.newContext({ storageState, viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await goto(page, `${BASE}/en${dyn.from}`)
    await settle(page)
    let href = null
    if (dyn.clickSelector) {
      const before = page.url()
      await page.locator(dyn.clickSelector).first().click().catch(() => {})
      await page.waitForURL((u) => u.toString() !== before, { timeout: 15_000 }).catch(() => {})
      const landed = page.url()
      href = landed !== before ? landed : null
    } else {
      href = await page.locator(dyn.linkSelector).first().getAttribute('href').catch(() => null)
    }
    await ctx.close()
    if (!href) {
      console.log(`dynamic ${shell} ${dyn.label}: NO link matched ${dyn.linkSelector} on ${dyn.from} — FAIL`)
      results.parity.push({ shell, route: `<dynamic:${dyn.label}>`, mobileVisible: 0, desktopPresent: 0, missingAtDesktop: ['<unresolved dynamic route>'] })
      continue
    }
    const route = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\/(en|ar|fr)/, '')
    console.log(`dynamic ${shell} ${dyn.label}: → ${route}`)
    cfg.routes.push(route)
    cfg.keyRoutes.push(route)
  }

  // ── 1 · §4.3 parity per route (en/light) ──
  for (const route of cfg.routes) {
    const mob = await browser.newContext({ storageState, viewport: { width: 390, height: 844 } })
    const mp = await mob.newPage()
    await goto(mp, `${BASE}/en${route}`)
    await settle(mp)
    const atMobile = await testids(mp, 'visible')
    await mob.close()

    const desk = await browser.newContext({ storageState, viewport: { width: 1280, height: 800 } })
    const dp = await desk.newPage()
    await goto(dp, `${BASE}/en${route}`)
    await settle(dp)
    const atDesktop = new Set(await testids(dp, 'present'))
    await desk.close()

    const missing = atMobile.filter((t) => !atDesktop.has(t))
    results.parity.push({ shell, route, mobileVisible: atMobile.length, desktopPresent: atDesktop.size, missingAtDesktop: missing })
    console.log(`parity ${shell} ${route}: 390-visible=${atMobile.length} 1280-present=${atDesktop.size} missing=${missing.length}${missing.length ? ' → ' + missing.join(',') : ''}`)
  }

  // ── 2 · §4.1 XOR at the breakpoints ──
  for (const width of [390, 768, 1024, 1280]) {
    const ctx = await browser.newContext({ storageState, viewport: { width, height: 900 } })
    const page = await ctx.newPage()
    await goto(page, `${BASE}/en${cfg.routes[0]}`)
    await settle(page)
    const tabBarVisible = await (await vis(page, '[data-testid="tab-bar"]')).count() > 0
    const railVisible = await (await vis(page, cfg.railSelector || '[data-testid="desktop-rail"]')).count() > 0
    const ok = width < 768 ? tabBarVisible && !railVisible : railVisible && !tabBarVisible
    results.xor.push({ shell, width, tabBarVisible, railVisible, ok })
    console.log(`xor ${shell} @${width}: tabBar=${tabBarVisible} rail=${railVisible} ${ok ? 'OK' : 'FAIL'}`)
    await ctx.close()
  }

  // ── 3 · §6.3 capture matrix ──
  for (const route of cfg.keyRoutes) {
    const slug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    for (const locale of ['en', 'ar']) {
      for (const theme of ['light', 'dark']) {
        for (const width of [390, 1280]) {
          const ctx = await browser.newContext({ storageState, viewport: { width, height: width < 768 ? 844 : 800 } })
          if (theme === 'dark') await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'))
          const page = await ctx.newPage()
          await goto(page, `${BASE}/${locale}${route}`)
          await settle(page)
          const name = `${shell}-${slug}-${locale}-${theme}-${width}.png`
          await page.screenshot({ path: join(OUT, 'shots', name) })
          results.shots.push(name)
          await ctx.close()
        }
      }
    }
    // Rail two-state proof (en/light @768 icon rail, @1024 expanded rail).
    for (const width of [768, 1024]) {
      const ctx = await browser.newContext({ storageState, viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      await goto(page, `${BASE}/en${route}`)
      await settle(page)
      const name = `${shell}-${slug}-en-light-${width}.png`
      await page.screenshot({ path: join(OUT, 'shots', name) })
      results.shots.push(name)
      await ctx.close()
    }
  }
}

await browser.close()
writeFileSync(join(OUT, 'w2a-results.json'), JSON.stringify(results, null, 2))

const parityFails = results.parity.filter((p) => p.missingAtDesktop.length > 0)
const xorFails = results.xor.filter((x) => !x.ok)
console.log(`\nPARITY: ${results.parity.length - parityFails.length}/${results.parity.length} routes clean; ${parityFails.length} with gaps`)
console.log(`XOR: ${results.xor.length - xorFails.length}/${results.xor.length} checks clean`)
console.log(`SHOTS: ${results.shots.length}`)
process.exit(parityFails.length || xorFails.length ? 1 : 0)
