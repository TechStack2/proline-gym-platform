#!/usr/bin/env node
/**
 * W2a evidence harness (slice tooling — no product code).
 *
 * Produces, for the portal + coach shells:
 *  1. §4.3 PARITY GATE — for every routed surface, the set of interactive
 *     `data-testid`s VISIBLE at 390 must be PRESENT (attached) at 1280 in the
 *     same locale/theme. Reported as numbers per route + a failing list.
 *  2. §4.1 XOR GATE — at <768 the tab bar is visible and the rail is not; at
 *     ≥768 the rail is visible and the tab bar is not (checked at 390/768/1024/1280).
 *  3. §6.3 capture matrix — {en,ar} × {light,dark} × {390,1280} for the key
 *     surfaces, plus 768 + 1024 rail-state shots (en/light).
 *
 * Usage: node scripts/design-audit/w2a-evidence.mjs [--base http://localhost:3000]
 * Env:   E2E_GYM_SLUG (default proline-gym-local), E2E_PASSWORD
 *        W2A_OUT (default: w2a-artifacts/)
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
    keyRoutes: ['/portal', '/portal/classes', '/portal/billing'],
  },
  coach: {
    role: 'coach',
    routes: ['/coach', '/coach/attendance', '/coach/students', '/coach/trials', '/coach/pt', '/coach/profile'],
    keyRoutes: ['/coach', '/coach/attendance'],
  },
}

async function login(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/en/auth/login`)
  await page.fill('#email', `${role}+${SLUG}@e2e.local`)
  await page.fill('#password', PWD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 })
  const state = await ctx.storageState()
  await ctx.close()
  return state
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

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
}

const results = { parity: [], xor: [], shots: [] }
const browser = await chromium.launch()

for (const [shell, cfg] of Object.entries(SHELLS)) {
  const storageState = await login(browser, cfg.role)

  // ── 1 · §4.3 parity per route (en/light) ──
  for (const route of cfg.routes) {
    const mob = await browser.newContext({ storageState, viewport: { width: 390, height: 844 } })
    const mp = await mob.newPage()
    await mp.goto(`${BASE}/en${route}`)
    await settle(mp)
    const atMobile = await testids(mp, 'visible')
    await mob.close()

    const desk = await browser.newContext({ storageState, viewport: { width: 1280, height: 800 } })
    const dp = await desk.newPage()
    await dp.goto(`${BASE}/en${route}`)
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
    await page.goto(`${BASE}/en${cfg.routes[0]}`)
    await settle(page)
    const tabBarVisible = await (await vis(page, '[data-testid="tab-bar"]')).count() > 0
    const railVisible = await (await vis(page, '[data-testid="desktop-rail"]')).count() > 0
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
          await page.goto(`${BASE}/${locale}${route}`)
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
      await page.goto(`${BASE}/en${route}`)
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
