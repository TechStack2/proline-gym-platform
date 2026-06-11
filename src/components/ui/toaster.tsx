'use client'

/**
 * Renderer for the use-toast store (B3 rider; UX-1 finding). The codebase has
 * two toast systems: sonner (already mounted in the root layout) and this
 * shadcn-style use-toast store, whose calls (attendance marking, legacy payment
 * forms) silently rendered NOTHING because no component ever consumed the
 * store. This mounts alongside sonner and renders that backlog.
 */
import { useToast } from './use-toast'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function UseToastRenderer() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="app-toast"
          data-variant={t.variant ?? 'default'}
          className={cn(
            'pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg',
            t.variant === 'destructive'
              ? 'border-red-200 bg-red-50 text-red-800'
              : t.variant === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-gray-200 bg-white text-gray-800',
          )}
        >
          <div>
            {t.title && <p className="font-semibold">{t.title}</p>}
            {t.description && <p className="mt-0.5 text-xs opacity-80">{t.description}</p>}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="dismiss" className="opacity-50 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
