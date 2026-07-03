/**
 * LOGIN-LIMITER — windowed in-memory rate counter (pure, unit-tested).
 *
 * Shared by (a) the middleware's pure-IP flood backstop and (b) the phone
 * sign-in server action's per-identifier limit. The two bundles get their own
 * module instances (middleware vs server) — intentional: each layer keeps its
 * own store; nothing needs to be shared across them.
 *
 * In-memory = per-process (same MVP constraint as the original middleware
 * store; a multi-instance deployment would move this to Redis/upstash).
 */

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export type RateLimitStore = Map<string, RateLimitEntry>;

export function createRateLimitStore(): RateLimitStore {
  return new Map();
}

/** Count one attempt against `key`; report whether it is within `limit` per `windowMs`. */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): { allowed: boolean; remaining: number; resetAt: number } {
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    const fresh: RateLimitEntry = { count: 1, resetAt: now + windowMs };
    store.set(key, fresh);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: fresh.resetAt };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}

/** Clear a key (e.g. a successful login ends that identifier's failed-attempt window). */
export function resetRateLimit(store: RateLimitStore, key: string): void {
  store.delete(key);
}

/** Drop expired entries (bounded memory); call opportunistically. */
export function cleanupRateLimitStore(store: RateLimitStore, now: number = Date.now()): void {
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/** Parse a positive-integer env override, else the default. */
export function envLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
