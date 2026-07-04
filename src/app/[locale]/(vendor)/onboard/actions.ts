'use server';

import crypto from 'crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * WL-ONBOARDING-WIZARD — onboardGym server action (SERVER ONLY).
 *
 * Creates a NEW gym + its owner login. SUPER-ADMIN ONLY: this RE-ASSERTS
 * is_platform_admin() on the caller's own session BEFORE any write — the route
 * gate is UI only; a server action is directly invokable, so the gate here is the
 * real, non-bypassable security boundary. Privileged writes run through the
 * service-role client ONLY after that gate passes. Reuses provision-proline.js's
 * proven sequence (gym → GoTrue owner → profile gym_id fix → owner role → starter
 * catalog), with best-effort cleanup on any partial failure (GoTrue + Postgres
 * can't share one transaction, so the auth user is the only cross-system artifact).
 */

const OnboardSchema = z.object({
  gymNameEn: z.string().trim().min(2).max(120),
  gymNameAr: z.string().trim().min(1).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])$/, 'slug must be 3–100 chars, a–z 0–9 and hyphens'),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerFirstEn: z.string().trim().min(1).max(80),
  ownerLastEn: z.string().trim().min(1).max(80),
});

export type OnboardResult =
  | { ok: true; gymId: string; slug: string; ownerEmail: string; tempPassword: string }
  | { ok: false; error: string };

export async function onboardGym(input: unknown): Promise<OnboardResult> {
  // 1) NON-BYPASSABLE super-admin gate — the CALLER's session, never the UI.
  const caller = await createClient();
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  const { data: isAdmin, error: gateErr } = await caller.rpc('is_platform_admin');
  if (gateErr || isAdmin !== true) return { ok: false, error: 'forbidden' };

  // 2) Validate.
  const parsed = OnboardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid-input' };
  const f = parsed.data;

  // 3) Privileged writes (service-role; only reached AFTER the gate passed).
  const admin = createAdminClient();
  const tempPassword = 'Gp' + crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '') + '#7a';

  // 3a) Gym. Explicit sensible defaults (owner refines in Settings).
  const { data: gym, error: ge } = await admin
    .from('gyms')
    .insert({
      name_ar: f.gymNameAr,
      name_en: f.gymNameEn,
      name_fr: f.gymNameEn,
      slug: f.slug,
      currency_preference: 'USD',
      tax_rate: 0,
      enabled_products: { membership: true, class: true, pt: true, camp: true },
      is_active: true,
    })
    .select('id')
    .single();
  if (ge || !gym) return { ok: false, error: (ge as { code?: string } | null)?.code === '23505' ? 'slug-taken' : 'gym-failed' };
  const gymId = gym.id as string;

  const dropGym = async () => {
    await admin.from('gyms').delete().eq('id', gymId);
  };

  // 3b) Owner auth user via GoTrue admin. handle_new_user (000017) auto-creates the
  //     profile, but with gym_id = the OLDEST active gym — fixed in 3c.
  const { data: au, error: ae } = await admin.auth.admin.createUser({
    email: f.ownerEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { gym_id: gymId },
    app_metadata: { must_change_password: true },
  });
  if (ae || !au?.user) {
    await dropGym();
    return { ok: false, error: 'owner-email-failed' };
  }
  const ownerId = au.user.id;
  const rollback = async () => {
    await admin.auth.admin.deleteUser(ownerId).catch(() => {});
    await dropGym();
  };

  // 3c) Point the owner's profile at the NEW gym + set names (the trigger default).
  const { error: pe } = await admin
    .from('profiles')
    .update({
      gym_id: gymId,
      first_name_ar: f.ownerFirstEn, first_name_en: f.ownerFirstEn, first_name_fr: f.ownerFirstEn,
      last_name_ar: f.ownerLastEn, last_name_en: f.ownerLastEn, last_name_fr: f.ownerLastEn,
    })
    .eq('id', ownerId);
  if (pe) {
    await rollback();
    return { ok: false, error: 'profile-failed' };
  }

  // 3d) Owner role.
  const { error: re } = await admin
    .from('user_roles')
    .insert({ user_id: ownerId, gym_id: gymId, role: 'owner', is_primary: true });
  if (re) {
    await rollback();
    return { ok: false, error: 'role-failed' };
  }

  // 3e) Minimal starter catalog: a couple disciplines (visible) + one staged plan
  //     (is_active=false → owner sets the real price before it shows on the landing).
  const { error: de } = await admin.from('disciplines').insert([
    { gym_id: gymId, name_ar: 'ملاكمة', name_en: 'Boxing', name_fr: 'Boxe', sort_order: 1, is_active: true },
    { gym_id: gymId, name_ar: 'لياقة بدنية', name_en: 'Fitness', name_fr: 'Fitness', sort_order: 2, is_active: true },
  ]);
  if (de) {
    await rollback();
    return { ok: false, error: 'catalog-failed' };
  }
  const { error: mpe } = await admin.from('membership_plans').insert({
    gym_id: gymId,
    name_ar: 'اشتراك شهري', name_en: 'Monthly', name_fr: 'Mensuel',
    duration_days: 30, price_usd: 0, is_active: false,
  });
  if (mpe) {
    await rollback();
    return { ok: false, error: 'plan-failed' };
  }

  return { ok: true, gymId, slug: f.slug, ownerEmail: f.ownerEmail, tempPassword };
}
