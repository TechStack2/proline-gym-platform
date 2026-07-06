import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Building2, Plus, Users } from 'lucide-react';

// Super-admin surface — always per-request (reads the caller's session + gate).
export const dynamic = 'force-dynamic';

type AdminGym = {
  id: string;
  name_en: string | null;
  slug: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number;
};

/**
 * VENDOR-CONSOLE — the platform admin's home (the WL provider surface). Server
 * gate mirrors /onboard EXACTLY: anon → login; any authenticated non-platform-admin
 * → notFound() (404 — hidden, not merely denied). The cross-tenant gym list comes
 * from the SECURITY DEFINER get_all_gyms_for_admin() (000083), which re-asserts the
 * same is_platform_admin() gate server-side (never client-trusted). List + onboard
 * only.
 */
export default async function VendorConsolePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (isAdmin !== true) notFound();

  const { data } = await supabase.rpc('get_all_gyms_for_admin');
  const gyms = (data ?? []) as AdminGym[];
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-CA'); // stable YYYY-MM-DD

  return (
    <div className="mx-auto max-w-4xl px-4 py-10" data-testid="vendor-console">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="vendor-title">
            Gym 360 Pro — Vendor Console
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <Building2 className="h-4 w-4" /> {gyms.length} gym{gyms.length === 1 ? '' : 's'} on the platform
          </p>
        </div>
        <Link
          href={`/${locale}/onboard`}
          data-testid="vendor-onboard-link"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#cd1419] px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-[#a81014]"
        >
          <Plus className="h-4 w-4" /> Onboard a new gym
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-start text-gray-500">
              <th className="p-3 font-medium">Gym</th>
              <th className="p-3 font-medium">Slug</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Members</th>
              <th className="p-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody data-testid="vendor-gym-list">
            {gyms.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400" data-testid="vendor-gyms-empty">
                  No gyms yet.
                </td>
              </tr>
            ) : (
              gyms.map((g) => (
                <tr key={g.id} className="border-b last:border-0 hover:bg-gray-50" data-testid="vendor-gym-row" data-slug={g.slug ?? ''}>
                  <td className="p-3 font-medium text-gray-900">{g.name_en || '—'}</td>
                  <td className="p-3 font-mono text-xs text-gray-600">{g.slug || '—'}</td>
                  <td className="p-3">
                    <span
                      data-testid="vendor-gym-status"
                      className={g.is_active
                        ? 'inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                        : 'inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500'}
                    >
                      {g.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-gray-400" /> {g.member_count}</span>
                  </td>
                  <td className="p-3 text-gray-500" dir="ltr">{fmtDate(g.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
