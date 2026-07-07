'use client';

/**
 * ERROR-COPY — client hook. Returns a function that maps a stable action-error KEY
 * (from actionError()) to friendly, localized copy via the `errors.*` namespace, with
 * a generic fallback for any unknown key. Clients call `errText(res.error)` — they
 * never interpolate the raw string. One hook per component; call it at the top level.
 */
import { useTranslations } from 'next-intl';
import { errorText, actionError } from './action-error';

export function useErrorText() {
  const t = useTranslations('errors');
  return (key: string | null | undefined) => errorText(t, key);
}

/**
 * Client hook for the throw+catch idiom: maps a CAUGHT error — a raw Supabase/pg
 * error from a direct client mutation OR a stable key re-thrown via
 * `new Error(res.error)` — to friendly copy. `actionError` does the raw→key mapping
 * (and logs the raw error), then the `errors.*` namespace translates it. Use in a
 * `catch` so a receptionist never sees a constraint name from a client-side write.
 */
export function useCaughtErrorText() {
  const t = useTranslations('errors');
  return (err: unknown) => errorText(t, actionError(err));
}
