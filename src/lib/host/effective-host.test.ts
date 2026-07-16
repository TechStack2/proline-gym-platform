import { describe, it, expect, afterEach } from 'vitest';
import { effectiveHost } from './effective-host';

/** Minimal Headers-like reader (case-insensitive get). */
function hdrs(map: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (n: string) => lower[n.toLowerCase()] ?? null };
}

const SECRET = 'super-secret-proxy-key';
const PROXIED = { 'x-praxella-host': 'proline-gym.com', 'x-praxella-proxy-key': SECRET };
const PLAIN = { host: 'proline.up.railway.app' };

afterEach(() => { delete process.env.PROXY_HOST_SECRET; });

describe('OXY-HOST · effectiveHost', () => {
  it('NO env secret → pure passthrough (ignores X-Praxella-* entirely)', () => {
    // even a full, matching-looking proxied set is ignored when no secret is set
    expect(effectiveHost(hdrs({ ...PLAIN, ...PROXIED }))).toBe('proline.up.railway.app');
  });

  it('secret set + correct key → trusts the proxied X-Praxella-Host', () => {
    process.env.PROXY_HOST_SECRET = SECRET;
    expect(effectiveHost(hdrs({ ...PLAIN, ...PROXIED }))).toBe('proline-gym.com');
  });

  it('secret set + WRONG key → ignores the proxied host, falls back to Host', () => {
    process.env.PROXY_HOST_SECRET = SECRET;
    expect(effectiveHost(hdrs({ ...PLAIN, 'x-praxella-host': 'evil.example.com', 'x-praxella-proxy-key': 'wrong' })))
      .toBe('proline.up.railway.app');
  });

  it('secret set + proxied host but NO key → falls back to Host', () => {
    process.env.PROXY_HOST_SECRET = SECRET;
    expect(effectiveHost(hdrs({ ...PLAIN, 'x-praxella-host': 'evil.example.com' })))
      .toBe('proline.up.railway.app');
  });

  it('secret set + correct key normalizes the proxied host (lowercase, no port)', () => {
    process.env.PROXY_HOST_SECRET = SECRET;
    expect(effectiveHost(hdrs({ ...PLAIN, 'x-praxella-host': 'Proline-Gym.COM:443', 'x-praxella-proxy-key': SECRET })))
      .toBe('proline-gym.com');
  });

  it('never trusts X-Forwarded-Host (removed) — resolves to plain Host', () => {
    process.env.PROXY_HOST_SECRET = SECRET;
    expect(effectiveHost(hdrs({ host: 'proline.up.railway.app', 'x-forwarded-host': 'spoof.example.com' })))
      .toBe('proline.up.railway.app');
  });
});
