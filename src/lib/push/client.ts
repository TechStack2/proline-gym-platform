'use client'

import { savePushSubscription, deletePushSubscription } from './actions'

/**
 * PUSH-1 — browser-side subscribe/unsubscribe. Honest about what the platform
 * cannot control: OS permission + DND are the browser's to grant; iOS only fires
 * web-push on an INSTALLED PWA (16.4+). The UI copy states this; here we just
 * report capability truthfully.
 */
/**
 * The public VAPID key: the build-time NEXT_PUBLIC_ value in prod. `window.
 * __PUSH_VAPID_PUBLIC_KEY__` is a runtime escape hatch used ONLY by e2e (so the
 * push UI can be exercised without baking a key into the whole suite's build);
 * it is undefined in prod. Absent key → the whole feature is inert (byte-identical).
 */
export function getVapidPublicKey(): string {
  const envKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  if (envKey) return envKey
  if (typeof window !== 'undefined') return (window as any).__PUSH_VAPID_PUBLIC_KEY__ || ''
  return ''
}

/** Push is technically usable in this browser (SW + PushManager + Notification). */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** The server has a public VAPID key configured (else the feature is inert). */
export function pushConfigured(): boolean {
  return !!getVapidPublicKey()
}

/** iOS/iPadOS Safari only delivers web-push when the PWA is installed to the home screen. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

/** Running as an installed PWA (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** Is this device currently subscribed (a live PushManager subscription exists)? */
export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}

export type SubscribeResult = { ok: boolean; reason?: 'unsupported' | 'not-configured' | 'denied' | 'error' }

export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (!pushConfigured()) return { ok: false, reason: 'not-configured' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(getVapidPublicKey()) as BufferSource,
      })
    }
    const json = sub.toJSON()
    const res = await savePushSubscription({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      userAgent: navigator.userAgent,
    })
    return res.ok ? { ok: true } : { ok: false, reason: 'error' }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean }> {
  if (!pushSupported()) return { ok: true }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await deletePushSubscription(sub.endpoint)
      await sub.unsubscribe()
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
