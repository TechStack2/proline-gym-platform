'use client'

/**
 * AUTH-DEPTH (REQ4) — the shared set-password hint. One component for every
 * choose-a-password surface (onboarding + /auth/reset): a policy line ("at least 10
 * characters") plus a simple weak/fair/strong meter driven by the shared
 * `passwordStrength` helper. Non-blocking (the surface's own `isPasswordValid` is the
 * gate); this only guides. Empty input renders nothing.
 */
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { passwordStrength, type PasswordStrength } from '@/lib/utils/password'

const SEGMENTS: Record<PasswordStrength, { filled: number; bar: string; text: string; labelKey: 'strengthWeak' | 'strengthFair' | 'strengthStrong' }> = {
  weak:   { filled: 1, bar: 'bg-amber-500',  text: 'text-amber-600',  labelKey: 'strengthWeak' },
  fair:   { filled: 2, bar: 'bg-yellow-500', text: 'text-yellow-600', labelKey: 'strengthFair' },
  strong: { filled: 3, bar: 'bg-green-600',  text: 'text-green-700',  labelKey: 'strengthStrong' },
}

export function PasswordStrengthHint({ pw, className }: { pw: string; className?: string }) {
  const t = useTranslations('password')
  if (!pw) return null
  const s = SEGMENTS[passwordStrength(pw)]
  return (
    <div className={cn('space-y-1', className)} data-testid="password-strength">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < s.filled ? s.bar : 'bg-gray-200')} />
        ))}
      </div>
      <p className={cn('text-xs', s.text)}>
        <span data-testid="password-strength-label" className="font-medium">{t(s.labelKey)}</span>
        <span className="text-gray-400"> · {t('hint')}</span>
      </p>
    </div>
  )
}
