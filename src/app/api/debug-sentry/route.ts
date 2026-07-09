import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

// OBSERVE — a tiny throw route to smoke-test Sentry AFTER the owner adds the DSN.
// platform_admin ONLY (re-asserted on the caller's OWN session, 000082) — everyone
// else gets 401/403 and NOTHING throws or is captured.
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isAdmin, error } = await supabase.rpc('is_platform_admin');
  if (error || isAdmin !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Reached only by a platform_admin: capture + throw so the owner sees the event.
  const err = new Error('OBSERVE debug-sentry: intentional test error (platform_admin smoke)');
  Sentry.captureException(err);
  await Sentry.flush(2000).catch(() => {});
  throw err;
}
