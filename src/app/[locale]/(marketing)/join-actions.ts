'use server'

/**
 * MJ-5 JOIN-DOOR — the public "Request to join" submit (Req1 + Req5).
 * Routed through a server action (not the anon client directly, like the trial
 * form) so it can carry an IP rate-limit CONSISTENT WITH THE LOGIN LIMITER
 * (src/lib/auth/rate-limit.ts, in-memory windowed counter) before reaching the
 * hardened anon RPC. The RPC (submit_public_lead, 000097) owns the durable
 * anti-abuse: honeypot + validation + 24h per-phone dedupe. Owner gate: this only
 * ever creates a LEAD — no account, no credential.
 */
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createRateLimitStore, checkRateLimit, envLimit } from '@/lib/auth/rate-limit'

export type JoinResult = 'ok' | 'duplicate' | 'invalid' | 'rate_limited'

// Per-process store (mirrors the login limiter's MVP posture; production upgrade
// path is the shared Redis limiter noted in src/middleware.ts).
const joinStore = createRateLimitStore()

export async function submitJoinRequest(input: {
  gymSlug: string
  name: string
  phone: string
  interests: string[]
  note?: string
  honeypot?: string
}): Promise<JoinResult> {
  // Consistent with the login limiter, the limit is bypassed under the e2e flag.
  if (process.env.E2E_TEST_MODE !== '1') {
    const h = headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown'
    const limit = envLimit('JOIN_RATE_LIMIT_PER_IP', 8)
    const windowMs = envLimit('JOIN_RATE_LIMIT_WINDOW_MS', 60_000)
    const { allowed } = checkRateLimit(joinStore, `join:${ip}`, limit, windowMs)
    if (!allowed) return 'rate_limited'
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_public_lead', {
    p_gym_slug: input.gymSlug,
    p_name: input.name,
    p_phone: input.phone,
    p_interests: input.interests,
    p_note: input.note ?? null,
    p_honeypot: input.honeypot ?? null,
  })
  if (error) return 'invalid'
  return (data as JoinResult) ?? 'ok'
}
