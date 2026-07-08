// OBSERVE — Sentry SERVER init (Node runtime). Loaded via src/instrumentation.ts.
// Env-driven: no NEXT_PUBLIC_SENTRY_DSN → disabled no-op.
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, COMMON_INIT } from '@/lib/observability/sentry';

Sentry.init({ dsn: SENTRY_DSN, ...COMMON_INIT });
