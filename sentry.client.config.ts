// OBSERVE — Sentry CLIENT init (browser). Auto-loaded by withSentryConfig into the
// client bundle (INLINE — no CDN loader, so the strict prod script-src covers it via
// strict-dynamic). Env-driven: no NEXT_PUBLIC_SENTRY_DSN → disabled no-op. FREE tier:
// NO Session Replay (the replay integration is never added).
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, COMMON_INIT } from '@/lib/observability/sentry';

Sentry.init({
  dsn: SENTRY_DSN,
  ...COMMON_INIT,
  // FREE tier: no replay. (These are inert without replayIntegration; kept explicit.)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
