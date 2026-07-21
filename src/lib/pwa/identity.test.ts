// @vitest-environment node
/**
 * W2c §5 — buildGymManifest unit coverage. The e2e pwa-manifest spec proves the
 * route + the LEGACY-logo branch (the seeded WL gym has no processed set); the
 * PROCESSED-maskable branch needs the existence probe stubbed, so it lives here:
 *  · probe HIT  → real 192/512 maskable PNG squares from the processed paths
 *  · probe MISS → the raw logo with sizes:'any' (the sizes stop lying)
 *  · locale/theme variation → start_url/lang/dir/description/background_color
 *  · default gym → byte-stable identity + the shipped icon set
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// React's RSC `cache()` does not exist in the vitest react build — shim it to a
// passthrough (per-request memoization is a server-runtime concern, not what
// these tests assert).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: (fn: unknown) => fn };
});

import { buildGymManifest } from './identity';
import type { LandingGym } from '@/lib/marketing/gym';

const GYM = {
  slug: 'unit-branded',
  name_en: 'Unit Branded Gym',
  brand_color: '#3366cc',
  logo_url: 'gym-1/gym-logo.jpg',
} as unknown as LandingGym;

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
});

describe('buildGymManifest (W2c §5)', () => {
  it('probe HIT → real processed maskable squares (sizes are true)', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    const m = await buildGymManifest(GYM, { locale: 'en' });
    expect(m.icons).toHaveLength(2);
    expect(m.icons[0]).toMatchObject({ sizes: '192x192', type: 'image/png', purpose: 'any maskable' });
    expect(m.icons[0].src).toContain('gym-1/gym-icon-192.png');
    expect(m.icons[1].src).toContain('gym-1/gym-icon-512.png');
  });

  it('probe MISS (legacy logo) → the raw logo with sizes:any, never maskable', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const m = await buildGymManifest(GYM, { locale: 'en' });
    expect(m.icons).toHaveLength(1);
    expect(m.icons[0].src).toContain('gym-1/gym-logo.jpg');
    expect(m.icons[0].sizes).toBe('any');
    expect(m.icons[0].purpose).toBe('any');
  });

  it('locale + theme drive start_url/lang/dir/description/background_color', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const ar = await buildGymManifest(GYM, { locale: 'ar', theme: 'dark' });
    expect(ar.start_url).toBe('/ar');
    expect(ar.lang).toBe('ar');
    expect(ar.dir).toBe('rtl');
    expect(ar.background_color).toBe('#131317');
    expect(ar.description).toContain('Unit Branded Gym');
    const fr = await buildGymManifest(GYM, { locale: 'fr' });
    expect(fr.start_url).toBe('/fr');
    expect(fr.dir).toBe('ltr');
    expect(fr.background_color).toBe('#ffffff');
    // An invalid locale param degrades to en.
    const bad = await buildGymManifest(GYM, { locale: 'xx' as never });
    expect(bad.start_url).toBe('/en');
  });

  it('default gym → byte-stable identity, shipped icons, no vendor pitch', async () => {
    const probe = vi.fn(async () => new Response(null, { status: 200 }));
    global.fetch = probe as unknown as typeof fetch;
    const m = await buildGymManifest(null, {});
    expect(m.name).toBe('PRO LINE Gym');
    expect(m.short_name).toBe('PRO LINE');
    expect(m.theme_color).toBe('#cd1419');
    expect(m.icons).toHaveLength(8);
    expect(m.icons[0].src).toBe('/icons/icon-72x72.png');
    expect(m.description).not.toContain('Management Platform');
    expect(m.start_url).toBe('/en');
    // The default path never probes storage.
    expect(probe).not.toHaveBeenCalled();
  });
});
