// ── Google-Maps link → {lat, lng} parser (LANDING-CUSTOM map picker) ──
// Owners paste a Google-Maps link (or raw "lat, lng") in Settings; we extract the
// coordinates for the OpenStreetMap embed + gyms.map_lat/map_lng. Pure + covered
// by unit tests. Short links (goo.gl/maps, maps.app.goo.gl) can't be resolved
// client-side without following the redirect → return null (owner uses the manual
// lat/lng fallback). Coordinates are rounded to 6 dp to match NUMERIC(9,6).

export type LatLng = { lat: number; lng: number }

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`

// Ordered patterns — first match wins. Covers the common Google-Maps URL shapes
// plus a raw "lat, lng" paste.
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`@${NUM},${NUM}`), //  /maps/@33.83,35.54,15z  or /place/…/@33.83,35.54,17z
  new RegExp(String.raw`[?&]q=${NUM},\s*${NUM}`), //  ?q=33.83,35.54  or &q=…
  new RegExp(String.raw`[?&]ll=${NUM},\s*${NUM}`), //  ?ll=33.83,35.54 (older marker links)
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`), //  embed data: !3d33.83!4d35.54
  new RegExp(String.raw`^\s*${NUM}\s*,\s*${NUM}\s*$`), //  raw "33.83 , 35.54" paste
]

function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    // reject the degenerate 0,0 (null-island) — almost always a parse miss, not a gym
    !(lat === 0 && lng === 0)
  )
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Parse a Google-Maps link (or raw "lat,lng") → {lat,lng}, or null if none found. */
export function parseMapLink(input: string): LatLng | null {
  if (!input || typeof input !== 'string') return null
  const s = input.trim()
  for (const re of PATTERNS) {
    const m = s.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lng = parseFloat(m[2])
      if (valid(lat, lng)) return { lat: round6(lat), lng: round6(lng) }
    }
  }
  return null
}
