'use client';

/**
 * DS 2.0 §4.1 — the desktop identity bar (Decision №2, RULED 2026-07-20).
 *
 * A 64px sticky top bar spanning the CONTENT region (it starts after the rail —
 * the parent applies `ms-[var(--rail-w)]`, the §4.1 layering law): tenant
 * identity at the start (logo monogram + gym name — DA-40's fix), shell tools in
 * the middle (staff-only search is W2b), then bell · theme · role chip at the
 * end. `z-30`; only Dialog/toast layers may exceed it. Desktop-only
 * (`hidden md:flex`) — below 768 the mobile status-zone chrome (§2.1) is its
 * counterpart. Logical-side utilities only.
 */

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

export type IdentityBarProps = {
  locale: string;
  /** The USER's gym identity (never the Host default's). */
  gymName?: string;
  logoUrl?: string | null;
  /** Localized role-chip label (the shells already own these maps). */
  roleLabel?: string | null;
  /** Mounted bell (the layout gates it to ONE breakpoint — DOUBLE-SHELL rule). */
  bell?: React.ReactNode;
  onSignOut?: () => void;
  children?: React.ReactNode;
};

export function IdentityBar({
  locale: _locale,
  gymName,
  logoUrl,
  roleLabel,
  bell,
  onSignOut,
  children,
}: IdentityBarProps) {
  const tCommon = useTranslations('common');

  return (
    <header
      data-testid="identity-bar"
      className={cn(
        'sticky top-0 z-30 hidden h-16 items-center gap-3 md:flex',
        'border-b border-gray-100 bg-white/90 px-4 backdrop-blur-md lg:px-6',
      )}
    >
      {/* Tenant identity — logo monogram + gym name (DA-40). */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-50 font-bold text-primary-600">
          {logoUrl ? (
            <Image src={logoUrl} alt="" width={36} height={36} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm">{(gymName || '?').charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span data-testid="identity-gym-name" className="truncate text-lg font-bold text-gray-900">
          {gymName || ''}
        </span>
      </div>

      {/* Shell-specific tools slot (staff search rides W2b). */}
      {children}

      <div className="ms-auto flex shrink-0 items-center gap-2">
        {bell}
        <ThemeToggle />
        {roleLabel && (
          <span
            data-testid="identity-role-chip"
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface)] px-2.5 py-1 text-xs font-bold text-white"
          >
            <span className="h-2 w-2 rounded-full bg-white/60" aria-hidden="true" />
            <span className="leading-none">{roleLabel}</span>
          </span>
        )}
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-red-50"
            aria-label={tCommon('signOut')}
            title={tCommon('signOut')}
          >
            <LogOut className="h-5 w-5 text-red-500" />
          </button>
        )}
      </div>
    </header>
  );
}
