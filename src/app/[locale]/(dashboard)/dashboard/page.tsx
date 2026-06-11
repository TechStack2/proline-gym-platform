import { redirect } from 'next/navigation';

type Props = { params: { locale: string } };

/**
 * IA-1: the schema-shaped dashboard is retired — the staff landing is the
 * journey-centric /today front-desk view. Old links/bookmarks keep working.
 */
export default function DashboardRedirect({ params: { locale } }: Props) {
  redirect(`/${locale}/today`);
}
