'use client';

/**
 * VENDOR-CONSOLE-1 — the (vendor) surface header: the signed-in platform-admin
 * email + a Sign-out control (the surface had none). signOut clears the Supabase
 * session client-side, then routes to the app login.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, ShieldCheck } from 'lucide-react';

export function VendorHeader({
  email, locale, brand, signOutLabel,
}: {
  email: string;
  locale: string;
  brand: string;
  signOutLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const signOut = () =>
    startTransition(async () => {
      await createClient().auth.signOut();
      router.replace(`/${locale}/auth/login`);
      router.refresh();
    });

  return (
    <header data-testid="vendor-header" className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <ShieldCheck className="h-4 w-4 text-primary-600" /> {brand}
        </span>
        <div className="flex items-center gap-3">
          <span data-testid="vendor-user-email" dir="ltr" className="max-w-[40vw] truncate text-xs text-gray-500">
            {email}
          </span>
          <button
            type="button"
            data-testid="vendor-signout"
            onClick={signOut}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" /> {signOutLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
