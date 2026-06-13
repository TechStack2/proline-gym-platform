import 'server-only'
import crypto from 'crypto'

/**
 * G1 token-at-rest encryption (AES-256-GCM). The per-gym Cloud-API access token
 * is stored as ciphertext only; the key lives in WHATSAPP_TOKEN_ENC_KEY (server
 * env, never NEXT_PUBLIC_). Combined with the table being REVOKED from the
 * client (000055), the plaintext token exists only transiently in server memory.
 */
const ALGO = 'aes-256-gcm'
function key(): Buffer {
  return crypto.createHash('sha256').update(process.env.WHATSAPP_TOKEN_ENC_KEY ?? 'dev-insecure-key').digest()
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv(ALGO, key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}

export function decryptToken(b64: string): string {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28)
  const d = crypto.createDecipheriv(ALGO, key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}
