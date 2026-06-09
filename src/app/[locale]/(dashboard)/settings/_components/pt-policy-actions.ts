'use server';

/**
 * PT delivery policy settings (Cycle 5 / Prompt C1). The two gym policy fields
 * are the server-side source of truth read inside the delivery RPCs (never
 * client-trusted). Staff-only via the gyms RLS + gym scoping.
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function updatePtPolicy(input: {
  gymId: string;
  noShowForfeits: boolean;
  lateCancelWindowHours: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const hours = Number.isFinite(input.lateCancelWindowHours)
    ? Math.max(0, Math.trunc(input.lateCancelWindowHours))
    : 0;

  const { error } = await supabase
    .from('gyms')
    .update({ pt_no_show_forfeits: input.noShowForfeits, pt_late_cancel_window_hours: hours })
    .eq('id', input.gymId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/[locale]/(dashboard)/settings', 'page');
  return { ok: true };
}
