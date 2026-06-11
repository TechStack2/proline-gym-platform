import { redirect } from 'next/navigation';

type Props = {
  params: { locale: string };
  searchParams: { search?: string; status?: string };
};

/**
 * IA-2: the lead pipeline is re-homed as the Members workspace's "Prospects"
 * tab (a lead is a person-status, not a separate world). Old links/bookmarks
 * keep working — the query string (search/status) is preserved.
 */
export default function LeadsRedirect({ params: { locale }, searchParams }: Props) {
  const qs = new URLSearchParams({ tab: 'prospects' });
  if (searchParams.search) qs.set('search', searchParams.search);
  if (searchParams.status) qs.set('status', searchParams.status);
  redirect(`/${locale}/students?${qs.toString()}`);
}
