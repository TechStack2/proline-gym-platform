import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { VendorHeader } from './vendor-header';

/**
 * VENDOR-CONSOLE-1 — the (vendor) route-group layout. Adds the shared header (brand
 * + signed-in email + Sign out) around every vendor surface (/vendor, /onboard).
 * Per-request (reads the caller's session). This does NOT render html/body — the
 * [locale] root layout owns those (nested layouts must not, per the prod CSP).
 * The header renders only for a platform admin; the pages keep their own hard gate.
 */
export const dynamic = 'force-dynamic';

type Props = { children: React.ReactNode; params: { locale: string } };

export default async function VendorLayout({ children, params: { locale } }: Props) {
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: isAdmin } = user ? await supabase.rpc('is_platform_admin') : { data: false };
  const t = await getTranslations('vendor.console');

  return (
    <div className="min-h-screen bg-gray-50">
      {user && isAdmin === true && (
        <VendorHeader
          email={user.email ?? ''}
          locale={locale}
          brand={t('brand')}
          signOutLabel={t('signOut')}
        />
      )}
      {children}
    </div>
  );
}
