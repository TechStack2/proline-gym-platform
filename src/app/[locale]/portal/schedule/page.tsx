import { redirect } from 'next/navigation'

type Props = { params: { locale: string } }

/**
 * DS 2.0 §3 (RULED 2026-07-20): the weekly schedule merged into the Classes
 * surface (segmented Schedule | Browse). Deep links and old bookmarks keep
 * working — this route redirects into the merged page's Schedule segment.
 */
export default function PortalSchedulePage({ params: { locale } }: Props) {
  redirect(`/${locale}/portal/classes?view=schedule`)
}
