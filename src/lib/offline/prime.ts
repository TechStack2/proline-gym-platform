'use client'

/**
 * OFF-4 (OFFLINE-DOOR) — shared offline priming + shell warming.
 *
 * Two jobs, both run OPPORTUNISTICALLY while online (not only on a desk visit),
 * so a front-desk user who logs in and never opens /desk still has a working
 * offline door:
 *
 *   1. `primeDeskMirror()` — pulls the front-desk core tables into the Dexie
 *      mirror (the REAL offline cache). Extracted here from offline-desk.tsx so
 *      the (dashboard) layer + the desk page share ONE module-level throttle
 *      (they never double-pull). Read-only; Supabase REST stays NetworkOnly in
 *      the SW (OFF-2 rule) — this reads the network live, never a stale SW copy.
 *
 *   2. `warmDeskShell()` — fetches the /desk DOCUMENT + its /_next chunks through
 *      the controlling SW so they land in the runtime caches AHEAD of need. The
 *      desk is the only offline READ surface, but its route-specific JS chunk is
 *      otherwise never fetched until the desk is opened — so a cold offline launch
 *      to /desk (never visited online) could not hydrate. Warming after login (while
 *      online) fixes the cold path.
 */
import { getSyncEngine } from '@/lib/db/sync-engine'

// The front-desk core the offline desk reads. Kept light so the prime doesn't
// contend with the rest of the app. `invoices`/`payments` back the OFF-3 offline
// record-payment balances + the OFF-5 balance-owed read; `coaches` gives today's
// schedule its coach name (class.coach_id → coaches.profile_id → the mirrored
// profile). `coaches` is a tiny per-gym table — negligible prime footprint (OFF-5
// req-4 payload-delta measurement).
export const CORE_TABLES = [
  'profiles', 'students', 'classes', 'class_schedules',
  'class_enrollments', 'student_memberships', 'pt_assignments',
  'invoices', 'payments', 'coaches',
] as const

// ─── Dexie mirror prime (shared, throttled) ───────────────────────────────
let lastDeskPrimeAt = 0

/**
 * Pull the front-desk core into the Dexie mirror. No-op offline; throttled to
 * once per 30s (the double-shell + layer/desk both call it). On failure the
 * throttle resets so the next online window retries.
 */
export function primeDeskMirror(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return // offline → no-op
  if (Date.now() - lastDeskPrimeAt < 30_000) return // throttle
  lastDeskPrimeAt = Date.now()
  getSyncEngine().pullAll({ full: true, tables: CORE_TABLES }).catch(() => {
    lastDeskPrimeAt = 0 // allow a retry on the next online window
  })
}

// ─── Desk shell warm (document + chunks) ──────────────────────────────────
let deskShellWarmed = false

/**
 * Warm the /desk document + the /_next JS/CSS it needs into the SW runtime caches,
 * so a cold offline launch can serve AND hydrate the desk without ever having
 * visited it online. Two complementary warms:
 *   • `prefetch(deskUrl)` (Next's router.prefetch) downloads the route's JS the
 *     idiomatic way — including the desk-specific page chunk.
 *   • `fetch(deskUrl)` warms the DOCUMENT (prefetch caches the RSC flight, not the
 *     full HTML a cold navigation requests), and its src/href /_next assets warm
 *     the CSS + any script-tag chunks.
 * Only meaningful once a SW controls the page (it is what caches the fetches).
 * Once per session; resets on failure to retry.
 */
export async function warmDeskShell(locale: string, prefetch?: (url: string) => void): Promise<void> {
  if (deskShellWarmed) return
  if (typeof navigator === 'undefined' || !navigator.onLine) return
  // The SW must be controlling — otherwise the fetch bypasses the runtime cache.
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return

  deskShellWarmed = true
  const deskUrl = `/${locale}/desk`
  try { prefetch?.(deskUrl) } catch { /* best-effort */ }
  try {
    const res = await fetch(deskUrl, { credentials: 'same-origin' })
    if (!res.ok) { deskShellWarmed = false; return }
    const html = await res.text()
    // Warm the exact JS/CSS the desk document links, so an offline cold-launch can
    // hydrate (the desk's route-specific chunk is otherwise never fetched). The
    // SW's static-assets / next-static routes cache each of these fetches.
    const assets = new Set<string>()
    for (const m of html.matchAll(/(?:src|href)="(\/_next\/[^"?]+\.(?:js|css))"/g)) assets.add(m[1])
    await Promise.all([...assets].map((u) => fetch(u, { credentials: 'same-origin' }).catch(() => {})))
  } catch {
    deskShellWarmed = false // allow a retry on the next online window
  }
}

/**
 * Warm the desk shell as soon as a controlling SW is available. If no controller
 * yet (a first install is still activating), retry once it takes control.
 */
export function scheduleDeskWarm(locale: string, prefetch?: (url: string) => void): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (navigator.serviceWorker.controller) { void warmDeskShell(locale, prefetch); return }
  const onControl = () => { void warmDeskShell(locale, prefetch) }
  navigator.serviceWorker.addEventListener('controllerchange', onControl, { once: true })
}
