import createNextIntlPlugin from 'next-intl/plugin';
import withPWAInit from 'next-pwa';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
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
    // ─── Supabase REST: Network First ───
    {
      urlPattern: /^https?:\/\/.*\.supabase\.co\/rest\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-rest-cache',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 60 * 5, // 5 min
        },
        networkTimeoutSeconds: 10,
      },
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ufpuebfkcpohwubrutff.supabase.co',
      },
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
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
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

export default withPWA(withNextIntl(nextConfig));
