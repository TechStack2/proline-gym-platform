'use server'

/**
 * PRAXELLA-DOOR R2/R3 — the public "Request a demo" submit for the Praxella
 * vendor landing. Routed through a server action (like the MJ-5 join-door, not
 * the anon client directly) so it carries an IP rate-limit consistent with the
 * login limiter before reaching the hardened anon RPC. The RPC
 * (submit_platform_lead, 000100) owns the durable anti-abuse: honeypot +
 * validation + length caps + a same-phone throttle. This only ever creates a
 * platform_leads row — no account, no credential.
 */
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createRateLimitStore, checkRateLimit, envLimit } from '@/lib/auth/rate-limit'

export type DemoResult = 'ok' | 'invalid' | 'rate_limited'

const demoStore = createRateLimitStore()

export async function submitDemoRequest(input: {
  name: string
  phone: string
  businessName?: string
  activityType?: string
  email?: string
  city?: string
  message?: string
  honeypot?: string
}): Promise<DemoResult> {
  if (process.env.E2E_TEST_MODE !== '1') {
    const h = headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown'
    const limit = envLimit('DEMO_RATE_LIMIT_PER_IP', 8)
    const windowMs = envLimit('DEMO_RATE_LIMIT_WINDOW_MS', 60_000)
    const { allowed } = checkRateLimit(demoStore, `demo:${ip}`, limit, windowMs)
    if (!allowed) return 'rate_limited'
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_platform_lead', {
    p_name: input.name,
    p_phone: input.phone,
    p_business_name: input.businessName ?? null,
    p_activity_type: input.activityType ?? null,
    p_email: input.email ?? null,
    p_city: input.city ?? null,
    p_message: input.message ?? null,
    p_honeypot: input.honeypot ?? null,
  })
  if (error) return 'invalid'
  return 'ok'
}
