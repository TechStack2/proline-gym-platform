import { setRequestLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { Inbox, ArrowLeft, Phone, MessageCircle, Mail } from 'lucide-react';
import { LeadRowActions } from './lead-row-actions';

// Super-admin surface — always per-request (reads the caller's session + gate).
export const dynamic = 'force-dynamic';

type PlatformLead = {
  id: string;
  name: string;
  business_name: string | null;
  activity_type: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  message: string | null;
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
};

const STATUS_CHIP: Record<PlatformLead['status'], string> = {
  new: 'bg-primary-100 text-primary-700',
  contacted: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
};

/**
 * PRAXELLA-DOOR R4 — the vendor console "Requests" inbox: demo requests captured
 * by the Praxella landing (platform_leads). Server gate mirrors the console home
 * EXACTLY: anon → login; any authenticated non-platform-admin → notFound(). The
 * list is read with the CALLER's client — platform_leads' RLS (is_platform_admin()
 * only) is the real gate. Status changes route through the gated server action.
 */
export default async function VendorRequestsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (isAdmin !== true) notFound();

  const t = await getTranslations('vendor.requests');
  const ta = await getTranslations('vendor.demo.activity');
  const isRTL = locale === 'ar';
  const { data } = await supabase
    .from('platform_leads')
    .select('id, name, business_name, activity_type, phone, email, city, message, status, created_at')
    .order('created_at', { ascending: false });
  const leads = (data ?? []) as PlatformLead[];
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-CA'); // stable YYYY-MM-DD
  const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
  const activityLabel = (a: string | null) =>
    a && ['gym', 'martial_arts', 'gymnastics', 'dance', 'other'].includes(a) ? ta(a as never) : '—';
  const statusLabel = (s: PlatformLead['status']) =>
    s === 'new' ? t('statusNew') : s === 'contacted' ? t('statusContacted') : t('statusClosed');

  return (
    <div className="mx-auto max-w-5xl px-4 py-10" data-testid="vendor-requests" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mb-6">
        <Link href={`/${locale}/vendor`} data-testid="requests-back"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} /> {t('backToConsole')}
        </Link>
        <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="requests-title">
          {t('title')}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
          <Inbox className="h-4 w-4" /> {t('subtitle')}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-start text-gray-500">
              <th className="p-3 font-medium">{t('colBusiness')}</th>
              <th className="p-3 font-medium">{t('colActivity')}</th>
              <th className="p-3 font-medium">{t('colContact')}</th>
              <th className="p-3 font-medium">{t('colLocation')}</th>
              <th className="p-3 font-medium">{t('received')}</th>
              <th className="p-3 font-medium">{t('colStatus')}</th>
              <th className="p-3 font-medium">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody data-testid="requests-list">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-400" data-testid="requests-empty">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className="border-b align-top last:border-0 hover:bg-gray-50" data-testid="request-row" data-status={l.status}>
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{l.business_name || '—'}</div>
                    <div className="text-xs text-gray-500">{l.name}</div>
                    {l.message && <div className="mt-1 max-w-xs text-xs text-gray-400">{l.message}</div>}
                  </td>
                  <td className="p-3 text-gray-600">{activityLabel(l.activity_type)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2" dir="ltr">
                      <a href={`tel:${l.phone}`} data-testid="request-tel" className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-primary-700">
                        <Phone className="h-3.5 w-3.5" /> {l.phone}
                      </a>
                      <a href={waLink(l.phone)} target="_blank" rel="noopener noreferrer" data-testid="request-whatsapp"
                        className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      {l.email && (
                        <a href={`mailto:${l.email}`} data-testid="request-email" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800">
                          <Mail className="h-3.5 w-3.5" /> {l.email}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-gray-600">{l.city || '—'}</td>
                  <td className="p-3 text-gray-500" dir="ltr">{fmtDate(l.created_at)}</td>
                  <td className="p-3">
                    <span data-testid="request-status" data-status={l.status}
                      className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CHIP[l.status])}>
                      {statusLabel(l.status)}
                    </span>
                  </td>
                  <td className="p-3">
                    <LeadRowActions leadId={l.id} status={l.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
