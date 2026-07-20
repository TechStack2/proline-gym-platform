'use client';

/**
 * DS2-FMT §2.7 — `NextIntlClientProvider` with the missing-key gate attached.
 *
 * `onError`/`getMessageFallback` have to be functions, and a Server Component
 * cannot hand a function across the client boundary — hence this client wrapper.
 * When the gate is off (every non-CI build) it renders the provider with exactly
 * the props it had before, so the tree is unchanged.
 *
 * ⚠ `locale` and `timeZone` MUST be passed explicitly by the caller.
 * `NextIntlClientProvider` picks the request config up automatically only when a
 * SERVER component renders it directly; from inside a client component that
 * injection does not happen, and its first statement is `if (!locale) throw` —
 * which 500s every page under this layout. That regression shipped here once
 * (runs 29708539112 and 29723649891, both dead on "Timed out waiting for
 * config.webServer" with zero tests run) and `next build` did NOT catch it: a
 * green build is not evidence that a page renders. The required props below are
 * what make it impossible to repeat.
 */
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { I18N_STRICT, reportIntlError, strictMessageFallback } from './strict';

type Props = ComponentProps<typeof NextIntlClientProvider> & {
  locale: string;
  timeZone: string;
};

export function StrictIntlProvider(props: Props) {
  return (
    <NextIntlClientProvider
      {...props}
      {...(I18N_STRICT
        ? { onError: reportIntlError, getMessageFallback: strictMessageFallback }
        : {})}
    />
  );
}
