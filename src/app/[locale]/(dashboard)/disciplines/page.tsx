import { redirect } from 'next/navigation'

type Props = { params: { locale: string } }

/**
 * ADM-2 sweep: this standalone page read disciplines with NO gym scope
 * (classes_read-style all-authenticated RLS → cross-gym rows) and its add-form
 * upserted without gym_id (NOT NULL violation — DOA). Settings → Disciplines
 * (ADM-1 manager) is the canonical CRUD; this route now redirects there.
 */
export default function DisciplinesRedirect({ params: { locale } }: Props) {
  redirect(`/${locale}/settings?tab=disciplines`)
}
