'use client'

/**
 * PORTAL-MODAL — keep a `fixed inset-0` modal viewport-fixed by escaping any
 * ancestor `transform`, WITHOUT relocating it when there's nothing to escape.
 *
 * A `position:fixed` descendant of a transformed element resolves against THAT
 * element's box, not the viewport. `PageTransition` (portal / coach / mobile-
 * dashboard shells) keeps `translate-x-0` (a real transform), so an inline modal
 * centers off-screen on a scrolled shell page. The desktop dashboard shell has NO
 * PageTransition, so its modals were already viewport-fixed inline.
 *
 * This component decides per-instance, after mount:
 *   • SKIP (render nothing) — the instance is inside a `display:none` ancestor.
 *     The (dashboard) layout renders content TWICE (mobile + desktop shells, the
 *     inactive one display:none); only the VISIBLE shell may surface a modal, else
 *     portaling would duplicate it at <body> ([[double-shell-duplicates-client-state]]).
 *   • PORTAL to <body> — the instance has a transformed ancestor (the bug). Escapes it.
 *   • INLINE (render children where they are) — visible AND no transformed ancestor
 *     (the desktop dashboard). Identical DOM/behavior to pre-PORTAL-MODAL, so
 *     shell-scoped tooling/tests that expect the modal inside the shell still work.
 *
 * Presentation/positioning ONLY: children, props, testids, and events are
 * unchanged (React events bubble across a portal; <body> inherits dir/font).
 * SSR-safe via the mount probe.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Mode = 'pending' | 'skip' | 'portal' | 'inline'

export function ModalPortal({ children }: { children: ReactNode }) {
  const probe = useRef<HTMLSpanElement>(null)
  const [mode, setMode] = useState<Mode>('pending')

  useEffect(() => {
    const el = probe.current
    if (!el || el.offsetParent === null) {
      // offsetParent === null ⇒ a `display:none` ancestor (the inactive shell).
      setMode('skip')
      return
    }
    let p: HTMLElement | null = el.parentElement
    let transformed = false
    while (p && p !== document.body && p !== document.documentElement) {
      const t = getComputedStyle(p).transform
      if (t && t !== 'none') { transformed = true; break }
      p = p.parentElement
    }
    setMode(transformed ? 'portal' : 'inline')
  }, [])

  if (mode === 'pending') return <span ref={probe} aria-hidden="true" />
  if (mode === 'skip') return null
  if (mode === 'inline') return <>{children}</>
  return createPortal(children, document.body)
}
