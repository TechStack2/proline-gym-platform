#!/usr/bin/env node
/**
 * LANDING R4 — anon-context probe: for each public route, load as a logged-out
 * visitor and record (1) every console error/warning, (2) every pageerror,
 * (3) every CSP violation (securitypolicyviolation events), (4) the distinct
 * supabase REST endpoints hit (proves the landing still reads ONLY through the
 * sanctioned anon definer RPCs — no new read paths). Also renders the collected
 * console feed as a visible overlay and screenshots it (the "clean console" shot
 * is the REAL event list, rendered).
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE || 'http://localhost:3000'
const SLUG = process.env.E2E_GYM_SLUG || 'proline-gym-local'
const OUT = process.env.PROBE_OUT || 'probe-artifacts'
mkdirSync(OUT, { recursive: true })

const ROUTES = ['/', `/?gym=${SLUG}`, '/auth/login', '/auth/forgot', '/auth/reset']
const results = []
const browser = await chromium.launch()

for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const consoleMsgs = []
  const pageErrors = []
  const restCalls = new Set()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push({ type: m.type(), text: m.text() })
  })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('request', (req) => {
    const u = req.url()
    const m = u.match(/\/rest\/v1\/(rpc\/[a-z0-9_]+|[a-z0-9_]+)/i)
    if (m) restCalls.add(m[1].split('?')[0])
  })
  await ctx.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI || e.sourceFile || 'inline'}`)
    })
  })
  const resp = await page.goto(`${BASE}/en${route === '/' ? '' : route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
  const csp = await page.evaluate(() => window.__cspViolations || [])
  const row = {
    route,
    status: resp?.status() ?? 0,
    consoleErrors: consoleMsgs.filter((m) => m.type === 'error'),
    consoleWarnings: consoleMsgs.filter((m) => m.type === 'warning'),
    pageErrors,
    cspViolations: csp,
    restEndpoints: [...restCalls].sort(),
  }
  results.push(row)
  // Render the REAL collected console feed as an overlay and screenshot it.
  await page.evaluate((r) => {
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:99999;background:#111;color:#0f0;font:12px/1.5 monospace;padding:12px 16px;max-height:40vh;overflow:auto'
    const lines = [
      `ANON CONSOLE PROBE — ${r.route} (HTTP ${r.status})`,
      `console errors: ${r.consoleErrors.length}`,
      ...r.consoleErrors.map((m) => `  ✗ ${m.text}`),
      `console warnings: ${r.consoleWarnings.length}`,
      ...r.consoleWarnings.map((m) => `  ⚠ ${m.text}`),
      `page errors: ${r.pageErrors.length}`,
      ...r.pageErrors.map((m) => `  ✗ ${m}`),
      `CSP violations: ${r.cspViolations.length}`,
      ...r.cspViolations.map((m) => `  ✗ ${m}`),
      `supabase REST endpoints: ${r.restEndpoints.join(', ') || '(none)'}`,
    ]
    el.textContent = lines.join('\n')
    el.style.whiteSpace = 'pre-wrap'
    document.body.appendChild(el)
  }, row)
  const slug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
  await page.screenshot({ path: join(OUT, `probe-${slug}.png`) })
  console.log(`${route}: status=${row.status} errors=${row.consoleErrors.length} warnings=${row.consoleWarnings.length} csp=${row.cspViolations.length} rest=[${row.restEndpoints.join(',')}]`)
  await ctx.close()
}

await browser.close()
writeFileSync(join(OUT, 'anon-probe.json'), JSON.stringify(results, null, 2))
const bad = results.filter((r) => r.consoleErrors.length || r.pageErrors.length || r.cspViolations.length || r.status >= 400)
console.log(bad.length ? `PROBE: ${bad.length} route(s) with findings` : 'PROBE: all routes clean')
process.exit(bad.length ? 1 : 0)
