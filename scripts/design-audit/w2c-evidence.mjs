#!/usr/bin/env node
/**
 * W2c evidence harness (slice tooling — no product code).
 *
 * Produces the §5 / R5 evidence pack against a local prod build + stack:
 *  1. Manifest JSON matrix — branded tenant (en/ar/dark) vs the default gym
 *     (byte-stable identity), saved as JSON + a summary diff.
 *  2. Icon-processing proof — drives the REAL settings upload with a rectangular
 *     logo, then downloads the emitted gym-icon-{512,192,180}.png and records
 *     their true pixel dimensions (PNG IHDR).
 *  3. Install-card matrix — {staff, coach, member} × {en, ar} × {iOS, Android}
 *     UAs at 390 (screenshots of the card).
 *  4. Offline door — BEFORE (git HEAD copy served separately by the caller) vs
 *     AFTER (neutral + stamped + stamped-Arabic renders of /offline.html).
 *  5. theme-color proof — the meta content with html.dark off/on + the manifest
 *     link's ?theme= behavior.
 *
 * Usage: node scripts/design-audit/w2c-evidence.mjs [--base http://localhost:3000]
 *        [--before http://localhost:8099/offline.html]
 * Env:   E2E_GYM_SLUG, E2E_PASSWORD, SUPABASE_SERVICE_ROLE_KEY,
 *        NEXT_PUBLIC_SUPABASE_URL, PROXY_HOST_SECRET, W2C_OUT (default w2c-artifacts)
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
const BASE = arg('base') || 'http://localhost:3000'
const BEFORE_URL = arg('before') || ''
const OUT = process.env.W2C_OUT || 'w2c-artifacts'
const SLUG = process.env.E2E_GYM_SLUG || 'proline-gym-local'
const PWD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROXY_KEY = process.env.PROXY_HOST_SECRET || 'local-evidence-proxy-secret'
const DOMAIN = 'w2c-brand.example.test'
mkdirSync(join(OUT, 'shots'), { recursive: true })
mkdirSync(join(OUT, 'manifests'), { recursive: true })
mkdirSync(join(OUT, 'icons'), { recursive: true })

const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
}

async function svc(method, path, body) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}

const pngDims = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })

async function login(browser, role, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts })
  const page = await ctx.newPage()
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${BASE}/en/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.fill('#email', `${role}+${SLUG}@e2e.local`)
      await page.fill('#password', PWD)
      await page.click('button[type="submit"]')
      await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 })
      const state = await ctx.storageState()
      await ctx.close()
      return state
    } catch (e) {
      if (attempt >= 3) throw e
      console.log(`login ${role}: attempt ${attempt} failed — retrying`)
    }
  }
}

const summary = { manifests: {}, icons: {}, themeColor: {}, shots: [] }
const browser = await chromium.launch()

// ── 1 · manifest matrix ────────────────────────────────────────────────────────
// Branded gym: own row + mapped domain (service-role writes, mirrors pwa-manifest.spec).
const [gym] = await svc('GET', `gyms?slug=eq.${SLUG}&select=id`)
await svc('PATCH', `gyms?id=eq.${gym.id}`, { name_en: 'W2c Branded Muay Thai', brand_color: '#3366cc', logo_url: '/landing/gym-2.jpg' })
await svc('POST', 'gym_domains', { gym_id: gym.id, domain: DOMAIN }).catch(() => {})

const fetchManifest = async (qs, headers = {}) => {
  const res = await fetch(`${BASE}/manifest.webmanifest${qs}`, { headers })
  return res.json()
}
const brandedHeaders = { 'x-praxella-host': DOMAIN, 'x-praxella-proxy-key': PROXY_KEY }
summary.manifests['branded-en'] = await fetchManifest('?locale=en', brandedHeaders)
summary.manifests['branded-ar'] = await fetchManifest('?locale=ar', brandedHeaders)
summary.manifests['branded-en-dark'] = await fetchManifest('?locale=en&theme=dark', brandedHeaders)
summary.manifests['default-en'] = await fetchManifest('?locale=en')
summary.manifests['default-ar'] = await fetchManifest('?locale=ar')
for (const [k, v] of Object.entries(summary.manifests)) {
  writeFileSync(join(OUT, 'manifests', `${k}.json`), JSON.stringify(v, null, 2))
  console.log(`manifest ${k}: name=${v.name} start_url=${v.start_url} lang=${v.lang} dir=${v.dir} bg=${v.background_color} icons[0]=${v.icons?.[0]?.src}·${v.icons?.[0]?.sizes}`)
}
// Un-brand again so the rest of the evidence (default-gym users) is unaffected.
await svc('PATCH', `gyms?id=eq.${gym.id}`, { name_en: 'PRO LINE E2E', brand_color: null, logo_url: null })

// ── 2 · icon-processing proof (the REAL settings upload) ──────────────────────
{
  const state = await login(browser, 'owner')
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  // Settings 2.0 is a card index — ?tab=gym opens the gym-identity section
  // where the logo input lives.
  await page.goto(`${BASE}/en/settings?tab=gym`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // A deliberately RECTANGULAR input (400×160 blue-on-white wordmark shape).
  const rect = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 160
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 400, 160)
    g.fillStyle = '#3366cc'; g.fillRect(16, 40, 368, 80)
    g.fillStyle = '#ffffff'; g.font = 'bold 48px sans-serif'; g.fillText('LOGO', 140, 96)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  writeFileSync(join(OUT, 'icons', 'input-rect-400x160.png'), Buffer.from(rect))
  await page.setInputFiles('[data-testid="gym-logo-input"]', {
    name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(rect),
  })
  // Poll the row: downscale + upload + 3 icon renders can take a few seconds.
  let g2 = null
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500)
    ;[g2] = await svc('GET', `gyms?id=eq.${gym.id}&select=logo_url`)
    if (g2?.logo_url) break
  }
  if (!g2?.logo_url) {
    const bodyText = await page.locator('body').innerText().catch(() => '')
    throw new Error(`logo upload never landed — page says: ${bodyText.slice(0, 600)}`)
  }
  console.log('uploaded logo_url =', g2.logo_url)
  const dir = g2.logo_url.slice(0, g2.logo_url.lastIndexOf('/') + 1)
  for (const size of [512, 192, 180]) {
    const url = `${SB}/storage/v1/object/public/avatars/${dir}gym-icon-${size}.png`
    const res = await fetch(url)
    if (!res.ok) { summary.icons[size] = `MISSING (${res.status})`; console.log(`icon-${size}: MISSING`); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(join(OUT, 'icons', `gym-icon-${size}.png`), buf)
    const d = pngDims(buf)
    summary.icons[size] = `${d.w}x${d.h}`
    console.log(`icon-${size}: ${d.w}x${d.h} (${buf.length}b)`)
  }
  // The manifest now serves the PROCESSED maskable set for this gym.
  const m = await fetchManifest('?locale=en') // default host = this gym (default slug)
  summary.icons.manifestAfterUpload = m.icons?.map((i) => `${i.src.split('/').pop()}·${i.sizes}·${i.purpose}`)
  console.log('manifest icons after upload:', summary.icons.manifestAfterUpload)
  // Clean up: back to no logo so other evidence/users see the default identity.
  await svc('PATCH', `gyms?id=eq.${gym.id}`, { logo_url: null })
  await ctx.close()
}

// ── 3 · install-card matrix ───────────────────────────────────────────────────
const ROLES = [
  { role: 'owner', path: (l) => `/${l}/today`, label: 'staff' },
  { role: 'coach', path: (l) => `/${l}/coach`, label: 'coach' },
  { role: 'student', path: (l) => `/${l}/portal`, label: 'member' },
]
for (const r of ROLES) {
  const state = await login(browser, r.role)
  for (const locale of ['en', 'ar']) {
    for (const [uaName, ua] of Object.entries(UA)) {
      const ctx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, userAgent: ua, locale })
      const page = await ctx.newPage()
      await page.goto(`${BASE}${r.path(locale)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
      await page.reload({ waitUntil: 'domcontentloaded' })
      const card = page.locator('[data-testid="install-app-card"]').first()
      try {
        await card.waitFor({ state: 'visible', timeout: 20_000 })
        await card.scrollIntoViewIfNeeded()
        await page.waitForTimeout(600)
        const name = `card-${r.label}-${locale}-${uaName}.png`
        await card.screenshot({ path: join(OUT, 'shots', name) })
        summary.shots.push(name)
        console.log(`card ${r.label}/${locale}/${uaName}: OK`)
      } catch {
        console.log(`card ${r.label}/${locale}/${uaName}: NOT VISIBLE — FAIL`)
        summary.shots.push(`FAIL:${r.label}-${locale}-${uaName}`)
      }
      await ctx.close()
    }
  }
}

// ── 4 · offline door (after: neutral / stamped / stamped-Arabic; before via --before) ──
{
  const shotsFor = async (name, init) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    if (init) await ctx.addInitScript(init)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/offline.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'shots', name) })
    summary.shots.push(name)
    await ctx.close()
  }
  await shotsFor('offline-after-neutral.png')
  await shotsFor('offline-after-stamped-en.png', `localStorage.setItem('praxella_offline_identity', JSON.stringify({ n: 'PRO LINE E2E', l: 'en' }))`)
  await shotsFor('offline-after-stamped-ar.png', `localStorage.setItem('praxella_offline_identity', JSON.stringify({ n: 'برولاين تجريبي', l: 'ar' }))`)
  if (BEFORE_URL) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(BEFORE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'shots', 'offline-before.png') })
    summary.shots.push('offline-before.png')
    await ctx.close()
  }
}

// ── 5 · theme-color proof (html.dark off/on drives the ONE meta + manifest link) ──
{
  const state = await login(browser, 'owner')
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/en/today`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const read = () => page.evaluate(() => ({
    content: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    manifestHref: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    htmlDark: document.documentElement.classList.contains('dark'),
  }))
  summary.themeColor.light = await read()
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(300)
  summary.themeColor.dark = await read()
  console.log('theme-color light:', JSON.stringify(summary.themeColor.light))
  console.log('theme-color dark:', JSON.stringify(summary.themeColor.dark))
  await ctx.close()
}

await browser.close()
writeFileSync(join(OUT, 'w2c-results.json'), JSON.stringify(summary, null, 2))
console.log('\nDONE — evidence in', OUT)
