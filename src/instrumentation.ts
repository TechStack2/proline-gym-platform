// OBSERVE — Next instrumentation hook: load the right Sentry init per runtime. A no-op
// (disabled SDK) when NEXT_PUBLIC_SENTRY_DSN is unset, so this is safe to merge before
// the owner creates the account.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
