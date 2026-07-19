#!/usr/bin/env node
/**
 * DESIGN-AUDIT · Phase 1 capture harness (REPORT-ONLY tooling — no product code).
 *
 * Sweeps every product surface across the audit matrix and writes the screenshot
 * pack + an objective per-page metrics log that the graded register
 * (docs/design-audit/2026-07-audit.md) cites.
 *
 * Matrix per surface:
 *   · 390×844  (primary mobile lens)  × {en, ar} × {light, dark}  → viewport shot
 *     (+ fullPage shot for en/light + ar/light)
 *   · 1280×800 (desktop lens)         × {en/light, en/dark, ar/light}
 *   · 360×800, 768×1024, 1920×1080    × en/light (width sweep)
 *
 * Objective metrics recorded per load (metrics.jsonl):
 *   · horizontal body overflow  (scrollWidth vs innerWidth — must be 0)
 *   · visible interactive targets smaller than 44×44 CSS px (count + samples)
 *   · console errors raised during load
 *   · document title, h1 count, html.dir, html.classList (theme actually applied)
 *
 * Auth: real login form per (gym, role) → storageState reuse (same idiom as
 * e2e/auth.setup.ts). Theme: localStorage 'theme' via addInitScript (the app's
 * own THEME_INIT reads it before first paint). Locale: path prefix.
 *
 * Usage:  node scripts/design-audit/capture.mjs [--only <group-substr>] [--base http://localhost:3000]
 * Env:    SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (for fixture id lookups)
 *         AUDIT_OUT (default: design-audit-artifacts/)
 */
import { chromium } from '@playwright/test'
import { mkdirSync, appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
const BASE = arg('base') || process.env.AUDIT_BASE || 'http://localhost:3000'
const ONLY = arg('only')
const OUT = process.env.AUDIT_OUT || 'design-audit-artifacts'
const PWD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NULL_SLUG = process.env.AUDIT_NULL_SLUG || 'nullbrand'

const SHOTS = join(OUT, 'shots')
const AUTH = join(OUT, '.auth')
const METRICS = join(OUT, 'metrics.jsonl')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(AUTH, { recursive: true })

// ── service-role REST lookup (fixture ids only — never rendered) ──────────────
async function rest(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}` },
  })
  if (!res.ok) throw new Error(`REST ${path} → ${res.status}`)
  return res.json()
}

// ── logins ────────────────────────────────────────────────────────────────────
const LOGINS = {
  'demo-owner': 'owner+demo@e2e.local',
  'demo-coach': 'coach+demo@e2e.local',
  'demo-student': 'student+demo@e2e.local',
  'demo-guardian': 'guardian@prolinegym.lb',
  'null-owner': `owner+${NULL_SLUG}@e2e.local`,
  'null-student': `student+${NULL_SLUG}@e2e.local`,
}

// ── surface matrix ────────────────────────────────────────────────────────────
// { group, name, path, auth } — {loc} replaced per shot. auth: key of LOGINS or null.
const SURFACES = [
  // staff dashboard (demo owner — teal brand-follow)
  { group: 'staff', name: 'today', path: '/{loc}/today', auth: 'demo-owner' },
  { group: 'staff', name: 'inbox', path: '/{loc}/inbox', auth: 'demo-owner' },
  { group: 'staff', name: 'members', path: '/{loc}/students', auth: 'demo-owner' },
  { group: 'staff', name: 'member-360', path: '/{loc}/students/{studentId}', auth: 'demo-owner' },
  { group: 'staff', name: 'guardians', path: '/{loc}/students/guardians', auth: 'demo-owner' },
  { group: 'staff', name: 'schedule', path: '/{loc}/schedule', auth: 'demo-owner' },
  { group: 'staff', name: 'money', path: '/{loc}/money', auth: 'demo-owner' },
  { group: 'staff', name: 'team', path: '/{loc}/coaches', auth: 'demo-owner' },
  { group: 'staff', name: 'settings', path: '/{loc}/settings', auth: 'demo-owner' },
  { group: 'staff', name: 'manage', path: '/{loc}/setup', auth: 'demo-owner' },
  { group: 'staff', name: 'desk', path: '/{loc}/desk', auth: 'demo-owner' },
  { group: 'staff', name: 'reports', path: '/{loc}/reports', auth: 'demo-owner' },
  { group: 'staff', name: 'notifications', path: '/{loc}/notifications', auth: 'demo-owner' },
  { group: 'staff', name: 'profile', path: '/{loc}/profile', auth: 'demo-owner' },

  // member portal (demo member Karim; family = demo guardian)
  { group: 'portal', name: 'home', path: '/{loc}/portal', auth: 'demo-student' },
  { group: 'portal', name: 'family', path: '/{loc}/portal', auth: 'demo-guardian' },
  { group: 'portal', name: 'schedule', path: '/{loc}/portal/schedule', auth: 'demo-student' },
  { group: 'portal', name: 'progress', path: '/{loc}/portal/progress', auth: 'demo-student' },
  { group: 'portal', name: 'billing', path: '/{loc}/portal/billing', auth: 'demo-student' },
  { group: 'portal', name: 'classes', path: '/{loc}/portal/classes', auth: 'demo-student' },
  { group: 'portal', name: 'pt', path: '/{loc}/portal/pt', auth: 'demo-student' },
  { group: 'portal', name: 'profile', path: '/{loc}/portal/profile', auth: 'demo-student' },

  // coach app (demo coach Sami)
  { group: 'coach', name: 'today', path: '/{loc}/coach', auth: 'demo-coach' },
  { group: 'coach', name: 'roster', path: '/{loc}/coach/students', auth: 'demo-coach' },
  { group: 'coach', name: 'pt', path: '/{loc}/coach/pt', auth: 'demo-coach' },
  { group: 'coach', name: 'attendance', path: '/{loc}/coach/attendance', auth: 'demo-coach' },
  { group: 'coach', name: 'trials', path: '/{loc}/coach/trials', auth: 'demo-coach' },
  { group: 'coach', name: 'profile', path: '/{loc}/coach/profile', auth: 'demo-coach' },

  // auth + onboarding
  { group: 'auth', name: 'login', path: '/{loc}/auth/login', auth: null },
  { group: 'auth', name: 'login-demo-accounts', path: '/{loc}/auth/login?demo=1', auth: null },
  { group: 'auth', name: 'forgot', path: '/{loc}/auth/forgot', auth: null },
  { group: 'auth', name: 'welcome', path: '/{loc}/welcome', auth: null },
  { group: 'auth', name: 'onboarding', path: '/{loc}/onboarding', auth: 'demo-owner' },

  // tenant landing (teal demo + NULL-brand defaults) + offline
  { group: 'landing', name: 'tenant-demo', path: '/{loc}?gym=demo', auth: null },
  { group: 'landing', name: 'tenant-nullbrand', path: `/{loc}?gym=${NULL_SLUG}`, auth: null },
  { group: 'landing', name: 'offline-fallback', path: '/offline.html', auth: null, noLocale: true },

  // NULL-brand staff shell (default crimson brand-follow check)
  { group: 'nullbrand', name: 'today', path: '/{loc}/today', auth: 'null-owner' },
  { group: 'nullbrand', name: 'settings', path: '/{loc}/settings', auth: 'null-owner' },
  { group: 'nullbrand', name: 'portal-home', path: '/{loc}/portal', auth: 'null-student' },
]

// ── shot matrix per surface ───────────────────────────────────────────────────
const CELLS = [
  { vp: [390, 844], loc: 'en', theme: 'light', full: true },
  { vp: [390, 844], loc: 'en', theme: 'dark' },
  { vp: [390, 844], loc: 'ar', theme: 'light', full: true },
  { vp: [390, 844], loc: 'ar', theme: 'dark' },
  { vp: [1280, 800], loc: 'en', theme: 'light' },
  { vp: [1280, 800], loc: 'en', theme: 'dark' },
  { vp: [1280, 800], loc: 'ar', theme: 'light' },
  { vp: [360, 800], loc: 'en', theme: 'light' },
  { vp: [768, 1024], loc: 'en', theme: 'light' },
  { vp: [1920, 1080], loc: 'en', theme: 'light' },
]

// ── auth: login once per LOGINS key, persist storageState ─────────────────────
async function ensureAuth(browser, key) {
  const file = join(AUTH, `${key}.json`)
  if (existsSync(file)) return file
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/en/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#email', LOGINS[key])
  await page.fill('#password', PWD)
  await page.click('button[type="submit"]')
  const ok = await page
    .waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
  if (!ok) {
    console.error(`✗ login FAILED for ${key} (${LOGINS[key]}) — surfaces using it will be skipped`)
    await ctx.close()
    return null
  }
  await ctx.storageState({ path: file })
  await ctx.close()
  console.log(`✓ auth ${key}`)
  return file
}

// ── metrics ───────────────────────────────────────────────────────────────────
async function collectMetrics(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const overflowX = Math.max(0, de.scrollWidth - window.innerWidth)
    const small = []
    for (const el of document.querySelectorAll('a, button, [role="button"], input[type="checkbox"], input[type="radio"]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (r.width < 44 || r.height < 44) {
        if (small.length < 200)
          small.push({
            w: Math.round(r.width), h: Math.round(r.height),
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 40),
            testid: el.getAttribute('data-testid') || undefined,
          })
      }
    }
    return {
      overflowX,
      innerWidth: window.innerWidth,
      scrollWidth: de.scrollWidth,
      smallTargetCount: small.length,
      smallTargets: small.slice(0, 12),
      title: document.title,
      h1Count: document.querySelectorAll('h1').length,
      dir: de.getAttribute('dir'),
      darkApplied: de.classList.contains('dark'),
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
    }
  })
}

// ── main ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch()
writeFileSync(METRICS, '')

// fixture: a member-360 target id on the demo gym
let studentId = ''
try {
  const gyms = await rest('gyms?slug=eq.demo&select=id')
  const students = await rest(`students?gym_id=eq.${gyms[0].id}&select=id&limit=1`)
  studentId = students[0]?.id || ''
  console.log(`✓ member-360 fixture student ${studentId}`)
} catch (e) {
  console.error(`✗ student fixture lookup failed (${e.message}) — member-360 will be skipped`)
}

const authFiles = {}
for (const key of Object.keys(LOGINS)) authFiles[key] = await ensureAuth(browser, key)

// context cache per (auth, theme) — viewport set per page, locale via URL path
const ctxCache = new Map()
async function ctxFor(authKey, theme) {
  const k = `${authKey || 'anon'}|${theme}`
  if (ctxCache.has(k)) return ctxCache.get(k)
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: authKey ? authFiles[authKey] || undefined : undefined,
  })
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t) } catch {} }, theme)
  ctxCache.set(k, ctx)
  return ctx
}

let shot = 0, failed = 0
for (const s of SURFACES) {
  if (ONLY && !`${s.group}/${s.name}`.includes(ONLY)) continue
  if (s.auth && !authFiles[s.auth]) { console.log(`- skip ${s.group}/${s.name} (no auth)`); continue }
  if (s.path.includes('{studentId}') && !studentId) { console.log(`- skip ${s.group}/${s.name} (no fixture)`); continue }
  const dir = join(SHOTS, s.group)
  mkdirSync(dir, { recursive: true })

  for (const cell of CELLS) {
    if (s.noLocale && cell.loc !== 'en') continue
    const url = BASE + s.path.replace('{loc}', cell.loc).replace('{studentId}', studentId)
    const stamp = `${s.name}--${cell.vp[0]}-${cell.loc}-${cell.theme}`
    const ctx = await ctxFor(s.auth, cell.theme)
    const page = await ctx.newPage()
    const consoleErrors = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`))
    try {
      await page.setViewportSize({ width: cell.vp[0], height: cell.vp[1] })
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
      await page.waitForTimeout(1200)
      const metrics = await collectMetrics(page).catch((e) => ({ error: String(e) }))
      await page.screenshot({ path: join(dir, `${stamp}.png`) })
      if (cell.full) await page.screenshot({ path: join(dir, `${stamp}-full.png`), fullPage: true }).catch(() => {})
      appendFileSync(METRICS, JSON.stringify({
        surface: `${s.group}/${s.name}`, url, vp: cell.vp[0], loc: cell.loc, theme: cell.theme,
        finalUrl: page.url(), consoleErrors: consoleErrors.slice(0, 8), ...metrics,
      }) + '\n')
      shot++
      if (shot % 25 === 0) console.log(`  …${shot} shots`)
    } catch (e) {
      failed++
      console.error(`✗ ${stamp}: ${e.message}`)
    } finally {
      await page.close()
    }
  }
  console.log(`✓ ${s.group}/${s.name}`)
}

await browser.close()
console.log(`DONE — ${shot} shots (${failed} failures) → ${SHOTS}; metrics → ${METRICS}`)
