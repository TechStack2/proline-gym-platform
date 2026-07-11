import createNextIntlPlugin from 'next-intl/plugin';
import withPWAInit from 'next-pwa';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// OBSERVE — the Sentry ingest origin, derived from the PUBLIC DSN, added to CSP
// connect-src ONLY when a DSN is configured (env-driven; no DSN → nothing added, so
// the CSP is byte-identical to today until the owner sets NEXT_PUBLIC_SENTRY_DSN).
const sentryIngestOrigin = (() => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return '';
  try { return new URL(dsn).origin; } catch { return ''; }
})();

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  // PWA-UPDATE: the new SW WAITS instead of silently taking over an already-loaded
  // page (which risks a mid-entry hard-reload at the front desk via Next buildId
  // skew). ServiceWorkerRegister detects the waiting worker and shows a non-blocking
  // "New version — Refresh" toast; tapping it posts SKIP_WAITING (worker/index.js)
  // to promote the waiting worker, then reloads once it takes control. First install
  // (no prior worker) still activates immediately, so offline engages on first visit.
  skipWaiting: false,
  // PWA-UPDATE one-time succession: a cache-version makes THIS deploy's /sw.js
  // byte-different (browsers install it over the stale, unversioned skipWaiting:true
  // worker) and gives it a FRESH precache; cleanupOutdatedCaches purges the old
  // caches when the new worker activates. Bump this string on any future SW change.
  cacheId: 'proline-gym-v2',
  disable: process.env.NODE_ENV === 'development',
  // OFF-4 (OFFLINE-DOOR): register the OFFLINE FRONT DOOR. next-pwa wires a
  // `handlerDidError → self.fallback(request)` into every runtime-cache route and
  // precaches this document; so when an offline navigation to an UNCACHED route
  // fails both network and cache, the SW serves the branded /offline.html (which
  // honestly states what works offline and deep-links / auto-forwards to the cached
  // /desk) instead of the browser's native "no internet" error page. Before this the
  // precached offline.html was dead weight — nothing ever served it.
  fallbacks: {
    document: '/offline.html',
  },
  // OFF-1: next-pwa builds an all-or-nothing precache manifest that, with Next 14
  // App Router, includes URLs `next start` 404s → the SW precache install REJECTS
  // → the worker goes redundant → never activates/controls → the offline machine
  // never engaged (compounding the missing worker-src CSP). Confirmed 404s:
  //   • /_next/app-build-manifest.json (build-time internal, never served)
  //   • /_next/static/<buildId>/_buildManifest.js + _ssgManifest.js
  //   • app-router page chunks under route groups — precached with URL-ENCODED
  //     `%5Blocale%5D` segments the static handler doesn't match (the app itself
  //     loads them via a different URL form, so this is precache-only).
  // Excluding these from PRECACHE lets install succeed; they're still cached at
  // runtime by the next-static StaleWhileRevalidate route on first online visit,
  // so a visited page still loads offline.
  buildExcludes: [
    /app-build-manifest\.json$/,
    /_buildManifest\.js$/,
    /_ssgManifest\.js$/,
    /\/chunks\/app\//,
  ],
  // Workbox caching strategies per MASTER_PLAN Phase D4
  runtimeCaching: [
    // ─── API Routes: Network First (fresh data, fallback to cache) ───
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60, // 1 hour
        },
        networkTimeoutSeconds: 10,
      },
    },
    // ─── Supabase REST: NETWORK ONLY (STABILIZE-3 / OFF-2 prime fix) ───
    // The Dexie mirror (SyncEngine.pullAll) is the REAL offline cache. Caching
    // Supabase REST in the SW on top of it poisoned the OFF-2 prime: NetworkFirst
    // tried the network for `networkTimeoutSeconds: 10` then fell back to the cache,
    // so the slower-RLS `class_enrollments` read (vs the simple students/classes
    // reads) timed out and returned a STALE/EMPTY cached response — the prime
    // bulkPut nothing and the offline desk roster never mirrored (off2:66), and real
    // offline front-desk users saw an empty roster. NetworkOnly = always hit the
    // network when online (no stale fallback, no 10s cap); offline the app reads the
    // Dexie mirror, never a stale SW copy of REST. (Registered before the catch-all
    // NetworkFirst route, so it wins for Supabase REST.)
    {
      urlPattern: /^https?:\/\/.*\.supabase\.co\/rest\/.*/i,
      handler: 'NetworkOnly',
      // OFF-4: an EMPTY options object is required now that `fallbacks` is set —
      // next-pwa injects its `handlerDidError` fallback plugin into every route and
      // reads `route.options.plugins`, so a route with no `options` crashes the build.
      // This stays NetworkOnly (NO REST caching — the OFF-2 rule holds); the injected
      // handler only runs on a network error, where self.fallback returns Response.error()
      // for a REST request (destination is not 'document') — byte-identical failure.
      options: {},
    },
    // ─── Static Assets (JS, CSS, fonts): Cache First ───
    {
      urlPattern: /\.(?:js|css|woff2?|ttf|eot)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    // ─── Images: Stale While Revalidate ───
    {
      urlPattern: /\.(?:png|jpg|jpeg|gif|svg|webp|ico|avif)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 300,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        },
      },
    },
    // ─── Next.js Static + Data: Stale While Revalidate ───
    {
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-static',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    // ─── Pages (HTML): Network First ───
    {
      urlPattern: /^https?:\/\/.*\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'page-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24, // 1 day
        },
        networkTimeoutSeconds: 8,
      },
    },
  ],
});

// ISO-DB: e2e serves a LOCAL Supabase stack, so avatar/storage images come from
// http://127.0.0.1:54321, not the cloud host. next/image rejects any host not in
// remotePatterns → broken images (e.g. the ADM-2 avatar chain). Derive the
// configured Supabase host from env and allow it too (prod cloud unchanged).
const supabaseRemotePattern = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const { protocol, hostname, port } = new URL(url);
    if (hostname.endsWith('.supabase.co')) return null; // already covered below
    return { protocol: protocol.replace(':', ''), hostname, ...(port ? { port } : {}) };
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // OBSERVE — Next 14 needs this flag to load src/instrumentation.ts (where the
  // Sentry server/edge init registers). Stable in Next 15; explicit here for 14.2.
  experimental: { instrumentationHook: true },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      ...(supabaseRemotePattern ? [supabaseRemotePattern] : []),
    ],
  },

  // ─── Security Headers ───
  // CSP strategy:
  //   DEV:  'unsafe-inline' + 'unsafe-eval' set here (Next.js HMR / React Refresh require them)
  //   PROD: CSP header is set dynamically in middleware (src/middleware.ts) which generates a
  //         per-request nonce and uses 'strict-dynamic' — no 'unsafe-inline' or 'unsafe-eval'.
  //         The CSP header is intentionally NOT set here for production to avoid conflicts.
  headers: async () => {
    const isDev = process.env.NODE_ENV === 'development';

    // Dev-only headers: CSP with unsafe-inline/unsafe-eval for HMR
    const devHeaders = isDev
      ? [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self'",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co${sentryIngestOrigin ? ' ' + sentryIngestOrigin : ''}`,
              // AX-3: allow the keyless OpenStreetMap embed (Facility map) in dev
              // too, so dev mirrors prod (the operative prod CSP is in middleware).
              "frame-src 'self' https://www.openstreetmap.org",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ]
      : [];

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          ...devHeaders,
        ],
      },
    ];
  },
};

// OBSERVE — Sentry BUILD options. Source-map upload is OPTIONAL: it runs only when
// SENTRY_AUTH_TOKEN is present (a CI secret) and is skipped cleanly otherwise, so a
// tokenless build (local + the current CI) never fails. No tunnel route (we add the
// ingest origin to CSP connect-src instead), no Vercel monitors (we deploy on Railway).
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  telemetry: false,
  disableLogger: true,
  widenClientFileUpload: false,
  automaticVercelMonitors: false,
  reactComponentAnnotation: { enabled: false },
};

const baseConfig = withPWA(withNextIntl(nextConfig));

// OBSERVE — apply the Sentry webpack layer (client SDK injection + source-map upload +
// auto-instrumentation) ONLY when a DSN is configured. No DSN → the build is
// byte-identical to today (no +60 kB SDK in the client bundle, no Sentry webpack), so
// this merges cleanly before the owner opts in; setting NEXT_PUBLIC_SENTRY_DSN at build
// activates it. (The inits/instrumentation stay compiled but are inert without a DSN.)
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(baseConfig, sentryBuildOptions)
  : baseConfig;
