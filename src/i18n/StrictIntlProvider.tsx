'use client';

/**
 * DS2-FMT §2.7 — `NextIntlClientProvider` with the missing-key gate attached.
 *
 * `onError` has to be a function, and a Server Component cannot hand a function
 * across the client boundary — hence this one-line client wrapper. When the gate
 * is off (every non-CI build) it renders the provider with exactly the props it
 * had before, so the tree is unchanged.
 */
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { I18N_STRICT, throwOnMissingMessage } from './strict';

export function StrictIntlProvider(props: ComponentProps<typeof NextIntlClientProvider>) {
  return (
    <NextIntlClientProvider
      {...props}
      {...(I18N_STRICT ? { onError: throwOnMissingMessage } : {})}
    />
  );
}
