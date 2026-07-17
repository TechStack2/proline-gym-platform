import { describe, it, expect } from 'vitest'
import { parseMapLink } from './map-link'

describe('parseMapLink', () => {
  it('parses the /maps/@lat,lng,zoom form', () => {
    expect(parseMapLink('https://www.google.com/maps/@33.833104,35.541895,15z')).toEqual({
      lat: 33.833104, lng: 35.541895,
    })
  })

  it('parses a /place/…/@lat,lng link', () => {
    const url = 'https://www.google.com/maps/place/Proline+Gym/@33.8331,35.5419,17z/data=!3m1'
    expect(parseMapLink(url)).toEqual({ lat: 33.8331, lng: 35.5419 })
  })

  it('parses the ?q=lat,lng form', () => {
    expect(parseMapLink('https://maps.google.com/?q=33.8331,35.5419')).toEqual({ lat: 33.8331, lng: 35.5419 })
  })

  it('parses the !3d…!4d embed form', () => {
    const url = 'https://www.google.com/maps/place/X/data=!3d33.8331!4d35.5419'
    expect(parseMapLink(url)).toEqual({ lat: 33.8331, lng: 35.5419 })
  })

  it('parses a raw "lat, lng" paste (manual fallback)', () => {
    expect(parseMapLink('  33.8331 , 35.5419 ')).toEqual({ lat: 33.8331, lng: 35.5419 })
  })

  it('rounds to 6 decimals (NUMERIC(9,6))', () => {
    const r = parseMapLink('@33.83310419,35.54189533,15z')
    expect(r).toEqual({ lat: 33.833104, lng: 35.541895 })
  })

  it('handles negative coordinates', () => {
    expect(parseMapLink('https://www.google.com/maps/@-33.8688,151.2093,12z')).toEqual({
      lat: -33.8688, lng: 151.2093,
    })
  })

  it('returns null for an unresolvable short link', () => {
    expect(parseMapLink('https://goo.gl/maps/abcDEF123')).toBeNull()
    expect(parseMapLink('https://maps.app.goo.gl/xyz')).toBeNull()
  })

  it('rejects out-of-range and null-island coordinates', () => {
    expect(parseMapLink('@91.0,35.0,15z')).toBeNull() // lat > 90
    expect(parseMapLink('@33.0,200.0,15z')).toBeNull() // lng > 180
    expect(parseMapLink('0,0')).toBeNull() // null island
  })

  it('returns null for empty / junk input', () => {
    expect(parseMapLink('')).toBeNull()
    expect(parseMapLink('not a link')).toBeNull()
    // @ts-expect-error runtime guard for non-string
    expect(parseMapLink(null)).toBeNull()
  })
})
