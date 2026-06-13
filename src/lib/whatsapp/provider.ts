import 'server-only'

/**
 * G1 Cloud-API provider with a test seam. `WHATSAPP_PROVIDER_MODE`:
 *   · 'live'   → a real POST to graph.facebook.com (the gym's token).
 *   · 'record' (default, CI) → NO external call; the dispatch records the
 *     outbound row as sent. A SENTINEL recipient (7+ trailing zero digits)
 *     forces a failure so CI can prove dispatch is best-effort (no rollback).
 */
const API_VERSION = 'v22.0'

function mode(): string { return process.env.WHATSAPP_PROVIDER_MODE ?? 'record' }

export async function sendWhatsApp(params: {
  phoneNumberId: string; accessToken: string; toDigits: string; body: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (mode() !== 'live') {
    if (/0{7,}$/.test(params.toDigits)) return { ok: false, error: 'forced error (record sentinel)' }
    return { ok: true } // record-mode "send" — no external call
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${params.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: params.toDigits, type: 'text', text: { body: params.body } }),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'send failed' }
  }
}
