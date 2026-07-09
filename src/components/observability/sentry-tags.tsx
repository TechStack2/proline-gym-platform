'use client';

// OBSERVE — tag client Sentry events with the NON-identifying gym slug + role (never
// the user id / email / phone). Rendered by the dashboard layout, which resolves both
// from the session. setTag on a disabled SDK is a no-op, so this is safe with no DSN.
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export function SentryTags({ gym, role }: { gym?: string | null; role?: string | null }) {
  useEffect(() => {
    if (gym) Sentry.setTag('gym', gym);
    if (role) Sentry.setTag('role', role);
  }, [gym, role]);
  return null;
}
