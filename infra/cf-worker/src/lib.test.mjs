import { describe, it, expect } from 'vitest';
import {
  normalizeHostname, isWww, apexHost, wwwApexLocation, buildOriginUrl,
  proxyRequestHeaders, HOST_HEADER, KEY_HEADER,
} from './lib.mjs';

describe('OXY-HOST worker · host helpers', () => {
  it('normalizeHostname lowercases + drops port', () => {
    expect(normalizeHostname('Proline-Gym.COM:443')).toBe('proline-gym.com');
    expect(normalizeHostname(null)).toBe('');
    expect(normalizeHostname('')).toBe('');
  });

  it('isWww / apexHost', () => {
    expect(isWww('www.proline-gym.com')).toBe(true);
    expect(isWww('proline-gym.com')).toBe(false);
    expect(apexHost('www.proline-gym.com')).toBe('proline-gym.com');
    expect(apexHost('proline-gym.com')).toBe('proline-gym.com'); // idempotent
  });
});

describe('OXY-HOST worker · www→apex 301', () => {
  it('redirects www to apex, preserving path + query + https', () => {
    expect(wwwApexLocation('https://www.proline-gym.com/ar/schedule?x=1'))
      .toBe('https://proline-gym.com/ar/schedule?x=1');
  });
  it('returns null for a non-www host (no redirect)', () => {
    expect(wwwApexLocation('https://proline-gym.com/en')).toBeNull();
  });
});

describe('OXY-HOST worker · origin URL', () => {
  it('repoints host to the Railway origin, keeps path + query + https', () => {
    expect(buildOriginUrl('https://proline-gym.com/en?a=b', 'proline.up.railway.app'))
      .toBe('https://proline.up.railway.app/en?a=b');
  });
  it('forces https even if the inbound was http', () => {
    expect(buildOriginUrl('http://proline-gym.com/x', 'origin.example.app'))
      .toBe('https://origin.example.app/x');
  });
});

describe('OXY-HOST worker · proxy headers (identity + anti-spoof)', () => {
  it('adds X-Praxella-Host + X-Praxella-Proxy-Key', () => {
    const out = proxyRequestHeaders([['accept', 'text/html']], { hostname: 'Proline-Gym.com', secret: 's3cr3t' });
    const map = new Map(out.map(([k, v]) => [k.toLowerCase(), v]));
    expect(map.get(HOST_HEADER)).toBe('proline-gym.com'); // normalized
    expect(map.get(KEY_HEADER)).toBe('s3cr3t');
    expect(map.get('accept')).toBe('text/html');
  });

  it('strips any client-supplied X-Praxella-* (cannot spoof identity)', () => {
    const out = proxyRequestHeaders(
      [['X-Praxella-Host', 'evil.example.com'], ['x-praxella-proxy-key', 'guessed'], ['accept', '*/*']],
      { hostname: 'proline-gym.com', secret: 'real' }
    );
    const hostVals = out.filter(([k]) => k.toLowerCase() === HOST_HEADER).map(([, v]) => v);
    const keyVals = out.filter(([k]) => k.toLowerCase() === KEY_HEADER).map(([, v]) => v);
    expect(hostVals).toEqual(['proline-gym.com']); // only ours, not evil.example.com
    expect(keyVals).toEqual(['real']);             // only ours, not "guessed"
  });

  it('omits the key header when no secret is configured', () => {
    const out = proxyRequestHeaders([['accept', '*/*']], { hostname: 'x.com', secret: undefined });
    expect(out.some(([k]) => k.toLowerCase() === KEY_HEADER)).toBe(false);
  });
});
