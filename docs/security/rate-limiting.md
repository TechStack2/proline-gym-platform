# Rate Limiting Strategy

## Overview

Rate limiting is a critical security control that protects the Proline Gym platform
from brute-force attacks, credential stuffing, API abuse, and denial-of-service
attempts. This document outlines the layered rate limiting approach.

---

## Layer 1: Supabase Auth (Built-in)

Supabase provides built-in rate limiting on authentication endpoints via GoTrue:

| Endpoint | Default Limit | Notes |
|---|---|---|
| `POST /auth/v1/signup` | 5 requests / 5 min per IP | Prevents mass account creation |
| `POST /auth/v1/token?grant_type=password` | 5 requests / 5 min per IP | Prevents credential brute-force |
| `POST /auth/v1/otp` | 3 requests / 5 min per email | Prevents OTP spam |
| `POST /auth/v1/magiclink` | 3 requests / 5 min per email | Prevents magic link abuse |

These limits are managed via the Supabase dashboard under **Authentication > Settings > Rate Limits**.
Defaults are sufficient for MVP; adjust in production based on traffic patterns.

---

## Layer 2: Next.js Middleware Rate Limiting (Recommended)

For custom API routes and server actions, implement rate limiting at the Next.js
middleware level. Two proven approaches:

### Option A: Upstash Rate Limit (Serverless Redis)

```ts
// middleware.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"), // 10 req per 10 seconds
  analytics: true,
});

export async function middleware(request: NextRequest) {
  // Apply to API routes only
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
    const { success, limit, reset, remaining } = await ratelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
```

### Option B: Vercel Edge Config + KV

For deployments on Vercel, use Edge Config to store rate limit counters
with KV for persistence. See [Vercel Rate Limiting Docs](https://vercel.com/docs/edge-network/rate-limiting).

---

## Layer 3: API Route-Level Rate Limits

For high-risk endpoints (e.g., QR code generation, WhatsApp message sending,
rental bookings), apply per-route rate limits:

| Route | Limit | Window | Rationale |
|---|---|---|---|
| `POST /api/whatsapp/send` | 10 | 1 min | Prevent WhatsApp API abuse costs |
| `POST /api/qr/generate` | 30 | 1 min | Prevent resource exhaustion |
| `POST /api/rentals/book` | 20 | 1 min | Prevent booking spam |
| `POST /api/attendance/check-in` | 60 | 1 min | High-throughput, but capped |

---

## Layer 4: Infrastructure-Level (Future)

For production deployment, consider:

- **Cloudflare WAF Rate Limiting** — If using Cloudflare as CDN, enable
  rate limiting rules at the edge (e.g., 100 req/10 sec per IP).
- **NGINX / Traefik `limit_req`** — If self-hosting, configure at the
  reverse-proxy layer before requests reach Next.js.
- **Supabase Database Connection Pooling** — Use PgBouncer to limit
  concurrent connections and prevent connection exhaustion attacks.

---

## Monitoring & Alerting

- Log all 429 responses with IP, path, and timestamp
- Set up alerts when rate limit hit rate exceeds a threshold (e.g., >50/min)
- Review Upstash/Vercel analytics dashboards weekly
- Block IPs that consistently trigger rate limits (via middleware or Cloudflare)

---

## Checklist

- [x] Supabase Auth built-in rate limits enabled (default)
- [ ] Next.js middleware rate limiting implemented (Phase D)
- [ ] API route-specific limits configured
- [ ] Infrastructure-level limits configured (pre-production)
- [ ] Monitoring and alerting set up
