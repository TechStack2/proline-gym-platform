'use client';

/**
 * PRAXELLA-DOOR R4 — per-row triage buttons for a platform lead. Mark-contacted /
 * mark-closed / reopen route through the gated setPlatformLeadStatus server action
 * (which re-asserts is_platform_admin before the service-role write). Optimistic
 * disable + router.refresh() on success (poll the committed status).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { setPlatformLeadStatus } from './actions';

type Status = 'new' | 'contacted' | 'closed';

export function LeadRowActions({ leadId, status }: { leadId: string; status: Status }) {
  const t = useTranslations('vendor.requests');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const set = (next: Status) =>
    start(async () => {
      setError('');
      const res = await setPlatformLeadStatus({ leadId, status: next });
      if (!res.ok) { setError(t('updateFailed')); return; }
      router.refresh();
    });

  const btn = 'rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 transition-colors';

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="lead-row-actions" data-status={status}>
      {status !== 'contacted' && (
        <button type="button" data-testid="lead-mark-contacted" disabled={pending}
          onClick={() => set('contacted')}
          className={cn(btn, 'border-blue-200 text-blue-700 hover:bg-blue-50')}>
          {t('markContacted')}
        </button>
      )}
      {status !== 'closed' && (
        <button type="button" data-testid="lead-mark-closed" disabled={pending}
          onClick={() => set('closed')}
          className={cn(btn, 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
          {t('markClosed')}
        </button>
      )}
      {status !== 'new' && (
        <button type="button" data-testid="lead-reopen" disabled={pending}
          onClick={() => set('new')}
          className={cn(btn, 'border-amber-200 text-amber-700 hover:bg-amber-50')}>
          {t('reopen')}
        </button>
      )}
      {error && <span className="text-xs text-red-600" data-testid="lead-action-error">{error}</span>}
    </div>
  );
}
