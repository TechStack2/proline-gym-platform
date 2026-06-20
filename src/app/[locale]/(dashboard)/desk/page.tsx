import { OfflineDesk } from './offline-desk'

// Dynamic so the per-request CSP nonce reaches the page → it hydrates in prod
// (OFF-1 lesson) and the client reads the Dexie mirror. The (dashboard) layout
// auth-gates it; the SW serves THIS page's cached HTML offline (OFF-1), where the
// client OfflineDesk then renders entirely from the cache.
export const dynamic = 'force-dynamic'

export default function DeskPage({ params: { locale } }: { params: { locale: string } }) {
  return <OfflineDesk locale={locale} />
}
