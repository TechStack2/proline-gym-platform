'use client'

/**
 * PORTAL-MODAL — render `children` into <body>, escaping any ancestor `transform`.
 *
 * Generalizes the WaiverSign (PORTAL-FND) fix. A `position:fixed` descendant of a
 * transformed element resolves against THAT element's box, not the viewport — and
 * `PageTransition` (portal / coach / mobile-dashboard shells) applies a transform.
 * So an inline `fixed inset-0` modal centers off-screen on a scrolled shell page.
 * Portaling the overlay to <body> (which has no transform) restores viewport
 * containment. SSR-safe via a mount guard (createPortal needs the DOM).
 *
 * Presentation/positioning ONLY: children, their props, testids, and event
 * handling are unchanged — React events still bubble through the component tree
 * across the portal boundary, and <body> inherits `dir`/font from <html>, so RTL
 * + theming are preserved. No-op for positioning on shells without a transform
 * (e.g. the desktop dashboard), where a fixed element was already viewport-fixed.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
