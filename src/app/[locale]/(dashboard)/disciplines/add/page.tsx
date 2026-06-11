import { redirect } from 'next/navigation'

type Props = { params: { locale: string } }

/** ADM-2: discipline creation lives in Settings → Disciplines (canonical CRUD). */
export default function DisciplineAddRedirect({ params: { locale } }: Props) {
  redirect(`/${locale}/settings?tab=disciplines`)
}
