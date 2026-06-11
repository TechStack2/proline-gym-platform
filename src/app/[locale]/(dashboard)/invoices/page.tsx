import { redirect } from 'next/navigation'

type Props = {
  params: { locale: string }
  searchParams: { search?: string; status?: string }
}

/** IA-2: invoices live in the unified Money workspace. Query string preserved. */
export default function InvoicesRedirect({ params: { locale }, searchParams }: Props) {
  const qs = new URLSearchParams({ tab: 'invoices' })
  if (searchParams.search) qs.set('search', searchParams.search)
  if (searchParams.status) qs.set('status', searchParams.status)
  redirect(`/${locale}/money?${qs.toString()}`)
}
