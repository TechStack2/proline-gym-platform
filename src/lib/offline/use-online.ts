'use client'

/**
 * G2 — online status + pending-attendance count hooks. SSR-safe (default
 * online=true; the real value is read in an effect). `useOnline` tracks the
 * browser online/offline events (Playwright context.setOffline fires these).
 */
import { useCallback, useEffect, useState } from 'react'
import { pendingCount } from './attendance'

export function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function usePendingAttendance(): { count: number; refresh: () => Promise<void> } {
  const [count, setCount] = useState(0)
  const refresh = useCallback(async () => {
    try { setCount(await pendingCount()) } catch { /* IndexedDB unavailable — leave 0 */ }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { count, refresh }
}
