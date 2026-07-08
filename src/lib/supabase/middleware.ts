import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPlatformAdmin, VENDOR_HOME } from '@/lib/auth/platform-admin';

type PortalRole = 'owner' | 'head_coach' | 'coach' | 'receptionist' | 'student' | 'parent' | 'external_coach';

const ROLE_PORTAL_MAP: Record<PortalRole, string> = {
  owner: '/dashboard',
  head_coach: '/dashboard',
  coach: '/coach',
  receptionist: '/dashboard',
  student: '/portal',
  parent: '/portal',
  external_coach: '/dashboard',
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — this keeps the user logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── ON-1 forced-change gate ──────────────────────────────────────────────
  // A freshly-invited user (temp password) must complete /onboarding before
  // anything else. The flag rides the JWT (app_metadata) — NO extra DB read.
  // Exempt /onboarding itself and /auth/* to avoid a redirect loop.
  if (user && (user.app_metadata as { must_change_password?: boolean } | null)?.must_change_password) {
    const p = request.nextUrl.pathname;
    if (!p.includes('/onboarding') && !p.includes('/auth/')) {
      const seg = p.split('/')[1];
      const locale = ['ar', 'en', 'fr'].includes(seg) ? seg : getPreferredLocale(request);
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/onboarding`;
      return NextResponse.redirect(url);
    }
  }

  // Protected routes — unauthenticated users redirected to login
  const protectedPaths = [
    '/dashboard', '/students', '/classes', '/schedule', '/attendance',
    '/payments', '/invoices', '/pt', '/camps', '/leads',
    '/reports', '/settings', '/profile', '/coach', '/portal',
  ];
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = protectedPaths.some((path) =>
    pathname.includes(path)
  );

  // ── PWA-SESSION: authenticated user entering at the landing ROOT → HOME ──────
  // The PWA manifest start_url is '/', so a relaunched installed app opens '/' →
  // '/{locale}' (the public marketing landing). The Supabase session IS restored
  // across a standalone relaunch (cookie-backed), but nothing redirected an
  // authenticated visitor off the landing — so the installed app "reopened on the
  // marketing page" instead of the user's home. Send an authenticated visitor at
  // the landing root to their role home (member/parent → /portal, coach → /coach,
  // staff → /dashboard). Only the bare root or '/{locale}' matches; deeper real
  // pages, /auth/*, and /onboarding are handled above/below (no loop — the targets
  // are never landing roots). The forced-change gate above already took priority.
  if (user) {
    const segments = pathname.split('/').filter(Boolean);
    const atLandingRoot =
      segments.length === 0 ||
      (segments.length === 1 && ['ar', 'en', 'fr'].includes(segments[0]));
    if (atLandingRoot) {
      const locale = segments[0] ?? getPreferredLocale(request);
      const url = request.nextUrl.clone();
      // VENDOR-CONSOLE: a platform admin's home is the vendor console — takes
      // precedence over any gym-role default (incl. the role-less 'owner' fallback).
      if (await isPlatformAdmin(supabase)) {
        url.pathname = `/${locale}${VENDOR_HOME}`;
        return NextResponse.redirect(url);
      }
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
      const role = (roleData?.role || 'owner') as PortalRole;
      url.pathname = `/${locale}${ROLE_PORTAL_MAP[role]}`;
      return NextResponse.redirect(url);
    }
  }

  // If user is not authenticated and trying to access a protected route
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = `/${getPreferredLocale(request)}/auth/login`;
    return NextResponse.redirect(url);
  }

  // If user is authenticated and on the login page, redirect to role-specific portal
  if (user && pathname.includes('/auth/login')) {
    const url = request.nextUrl.clone();
    // VENDOR-CONSOLE: platform admin → vendor console (before any gym-role default).
    if (await isPlatformAdmin(supabase)) {
      url.pathname = `/${getPreferredLocale(request)}${VENDOR_HOME}`;
      return NextResponse.redirect(url);
    }
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
    const role = (roleData?.role || 'owner') as PortalRole;
    url.pathname = `/${getPreferredLocale(request)}${ROLE_PORTAL_MAP[role]}`;
    return NextResponse.redirect(url);
  }

  // Redirect coach/student/parent away from /dashboard
  if (user && pathname.includes('/dashboard')) {
    // VENDOR-CONSOLE: the login form pushes '/dashboard'; a platform admin (role-less)
    // must land on the vendor console, not the empty staff dashboard.
    if (await isPlatformAdmin(supabase)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${getPreferredLocale(request)}${VENDOR_HOME}`;
      return NextResponse.redirect(url);
    }
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
    const role = roleData?.role as PortalRole | undefined;
    if (role === 'coach' || role === 'student' || role === 'parent') {
      const url = request.nextUrl.clone();
      url.pathname = `/${getPreferredLocale(request)}${ROLE_PORTAL_MAP[role]}`;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

function getPreferredLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get('accept-language') || '';
  if (acceptLanguage.includes('ar')) return 'ar';
  if (acceptLanguage.includes('fr')) return 'fr';
  return 'en';
}
