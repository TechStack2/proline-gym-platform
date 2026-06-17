import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

type Props = {
  children: React.ReactNode;
};

/**
 * Auth route layout.
 *
 * Two things matter here, both learned the hard way:
 *
 * 1. NO `<html>`/`<body>` — the locale ROOT layout renders the single
 *    `<html>`/`<body>` + fonts for the whole tree. A nested second `<html><body>`
 *    is invalid DOM and threw `NotFoundError: removeChild` on the auth→app
 *    navigation (every login, in dev).
 *
 * 2. It MUST stay dynamically rendered. The production CSP (middleware) uses
 *    `script-src 'strict-dynamic' 'nonce-<per-request>'`; a statically prerendered
 *    (SSG) route bakes its <script> tags at build time WITHOUT that per-request
 *    nonce, so `strict-dynamic` blocks every chunk → no hydration → the login
 *    form does a native submit and login silently fails in prod. Calling
 *    `getMessages()` here (WITHOUT `setRequestLocale`) opts the route into
 *    per-request rendering — exactly what kept it working on `main` — so the
 *    scripts carry the nonce. (Do NOT add `setRequestLocale`: it re-enables
 *    static rendering and reintroduces the CSP/nonce breakage.)
 */
export default async function AuthLayout({ children }: Props) {
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
