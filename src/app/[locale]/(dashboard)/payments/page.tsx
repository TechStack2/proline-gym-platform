import { redirect } from 'next/navigation'

type Props = {
  params: { locale: string }
  searchParams: { method?: string; from?: string; to?: string }
}

/** IA-2: payments live in the unified Money workspace. Query string preserved. */
export default function PaymentsRedirect({ params: { locale }, searchParams }: Props) {
  const qs = new URLSearchParams({ tab: 'payments' })
  for (const k of ['method', 'from', 'to'] as const) {
    if (searchParams[k]) qs.set(k, searchParams[k]!)
  }
  redirect(`/${locale}/money?${qs.toString()}`)
}
