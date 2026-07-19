import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { I18N_STRICT, throwOnMissingMessage } from './strict';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as 'ar' | 'en' | 'fr')) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    timeZone: 'Asia/Beirut',
    // §2.7 missing-key gate — spread so the non-strict config object stays exactly
    // what it was (no `onError: undefined` overriding next-intl's default handler).
    ...(I18N_STRICT ? { onError: throwOnMissingMessage } : {}),
  };
});
