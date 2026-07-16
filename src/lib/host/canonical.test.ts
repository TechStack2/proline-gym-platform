import { describe, it, expect } from 'vitest';
import { canonicalOrigin, canonicalUrl, hreflangAlternates, aliasRedirectTarget } from './canonical';
import { classifyHost } from './resolver';
import { SITE_URL } from '@/lib/seo';

const LOCALES = ['ar', 'en', 'fr'] as const;

describe('OXY-HOST · canonicalOrigin', () => {
  it('vendor host → the praxella apex', () => {
    expect(canonicalOrigin('praxella.com', classifyHost('praxella.com'))).toBe('https://praxella.com');
  });

  it('subdomain → itself (self-canonical)', () => {
    const h = 'proline.praxella.com';
    expect(canonicalOrigin(h, classifyHost(h))).toBe('https://proline.praxella.com');
  });

  it('mapped custom domain → itself (self-canonical)', () => {
    const h = 'proline-gym.com';
    expect(canonicalOrigin(h, classifyHost(h), { mappedByDomain: true })).toBe('https://proline-gym.com');
  });

  it('gym with a PRIMARY custom domain → the primary (even when arrived elsewhere)', () => {
    const h = 'proline.praxella.com'; // arrived on the subdomain alias
    expect(canonicalOrigin(h, classifyHost(h), { primaryDomain: 'proline-gym.com' }))
      .toBe('https://proline-gym.com');
  });

  it('?gym= preview selector → SITE_URL (not the railway host)', () => {
    const h = 'proline.up.railway.app';
    expect(canonicalOrigin(h, classifyHost(h), { hasGymParam: true })).toBe(SITE_URL);
  });

  it('DEFAULT / unmapped host → SITE_URL (demo/Railway unchanged)', () => {
    const h = 'proline.up.railway.app';
    expect(canonicalOrigin(h, classifyHost(h))).toBe(SITE_URL);
    expect(canonicalOrigin(h, classifyHost(h), { mappedByDomain: false })).toBe(SITE_URL);
  });
});

describe('OXY-HOST · canonicalUrl + hreflangAlternates', () => {
  it('canonicalUrl joins origin + locale', () => {
    expect(canonicalUrl('https://proline-gym.com', 'ar')).toBe('https://proline-gym.com/ar');
    expect(canonicalUrl('https://proline-gym.com/', 'en')).toBe('https://proline-gym.com/en');
  });

  it('hreflang has every locale + x-default → default locale, absolute', () => {
    const alt = hreflangAlternates('https://proline-gym.com', LOCALES, 'en');
    expect(alt).toEqual({
      ar: 'https://proline-gym.com/ar',
      en: 'https://proline-gym.com/en',
      fr: 'https://proline-gym.com/fr',
      'x-default': 'https://proline-gym.com/en',
    });
  });
});

describe('OXY-HOST · aliasRedirectTarget', () => {
  it('alias (subdomain) of a gym WITH a primary → 301 to primary, path preserved', () => {
    expect(aliasRedirectTarget('proline.praxella.com', 'proline-gym.com', '/ar'))
      .toBe('https://proline-gym.com/ar');
  });

  it('secondary custom domain → 301 to the primary', () => {
    expect(aliasRedirectTarget('proline.net', 'proline-gym.com', '/en'))
      .toBe('https://proline-gym.com/en');
  });

  it('request already ON the primary → no redirect', () => {
    expect(aliasRedirectTarget('proline-gym.com', 'proline-gym.com', '/en')).toBeNull();
  });

  it('no primary domain known (reader absent / gym without custom domain) → no redirect', () => {
    expect(aliasRedirectTarget('proline.praxella.com', null, '/en')).toBeNull();
    expect(aliasRedirectTarget('proline.praxella.com', undefined, '/en')).toBeNull();
  });
});
