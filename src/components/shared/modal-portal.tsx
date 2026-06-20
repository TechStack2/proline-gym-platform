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
 * DOUBLE-SHELL GUARD ([[double-shell-duplicates-client-state]]): the (dashboard)
 * layout renders its content TWICE — a mobile shell and a desktop shell — with the
 * inactive one `display:none`. An inline modal was de-duped because the hidden
 * shell's copy inherited `display:none`; portaling to <body> ESCAPES that, so BOTH
 * copies would surface. We therefore portal ONLY from the VISIBLE shell: a probe
 * whose `offsetParent` is null sits inside a `display:none` ancestor (the inactive
 * shell) and renders nothing. Single-shell pages (portal/coach) always have a
 * visible probe, so they portal as normal.
 *
 * Presentation/positioning ONLY: children, props, testids, and event handling are
 * unchanged (React events bubble through the tree across the portal; <body>
 * inherits `dir`/font from <html>). No-op for positioning on a transform-less
 * shell (the desktop dashboard), where a fixed element was already viewport-fixed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ModalPortal({ children }: { children: ReactNode }) {
  const probe = useRef<HTMLSpanElement>(null)
  const [portal, setPortal] = useState(false)

  useEffect(() => {
    // offsetParent === null ⇒ this instance is inside a `display:none` ancestor
    // (the inactive double-shell copy) — don't surface a duplicate in <body>.
    setPortal(probe.current?.offsetParent != null)
  }, [])

  if (!portal) return <span ref={probe} aria-hidden="true" />
  return createPortal(children, document.body)
}
