/**
 * Notification producer layer (Cycle 5 / gap M0).
 *
 * The reusable server-side substrate that every cross-actor handoff (PT, Lead,
 * Attendance, Belt, Billing — Prompts 22–24) uses to create notifications.
 *
 * Design:
 *  - Stores i18n KEYS + a `params` JSON, never rendered strings. The client
 *    renders via the next-intl `notifications` namespace.
 *  - Every insert is gym-scoped; RLS (000015) additionally enforces that only
 *    staff may insert, and only to a recipient in their own gym.
 *  - `recipientProfileId` is the recipient's profile id, which equals their
 *    auth user id (`profiles.id === auth.users.id`) and maps to
 *    `notifications.user_id`.
 */
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import type { NotificationType } from './types';

type UserRole = Database['public']['Enums']['user_role_enum'];

type NotificationContent = {
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, unknown>;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
};

export type CreateNotificationInput = NotificationContent & {
  recipientProfileId: string;
  gymId: string;
};

export type CreateNotificationForRoleInput = NotificationContent & {
  role: UserRole;
  gymId: string;
};

/** Build the DB row from content shared by both producers. */
function buildRow(
  userId: string,
  gymId: string,
  content: NotificationContent,
) {
  return {
    user_id: userId,
    gym_id: gymId,
    type: content.type,
    title_key: content.titleKey,
    body_key: content.bodyKey,
    params: (content.params ?? {}) as Database['public']['Tables']['notifications']['Insert']['params'],
    entity_type: content.entityType ?? null,
    entity_id: content.entityId ?? null,
    action_url: content.actionUrl ?? null,
  };
}

/**
 * Create a single notification addressed to one recipient, gym-scoped.
 * Returns the new row id.
 *
 * IMPORTANT — no `INSERT ... RETURNING`. A staff producer writes a row whose
 * `user_id` is the RECIPIENT, never the staff member's own `auth.uid()`. The
 * notifications INSERT policy permits that write, but the `notifications_select_self`
 * SELECT policy (`user_id = auth.uid()`) would block the row from being read
 * BACK — and PostgREST's `.select()` on an insert issues `INSERT ... RETURNING`,
 * which Postgres rejects as `42501 new row violates row-level security policy`
 * even though the INSERT itself is allowed. We therefore generate the id
 * client-side and do a plain insert, so the RETURNING/SELECT policy is never
 * exercised. (`createNotificationForRole` below is already RETURNING-free.)
 */
export async function createNotification(
  input: CreateNotificationInput,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<{ id: string }> {
  const supabase = client ?? (await createClient());
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from('notifications')
    .insert({ id, ...buildRow(input.recipientProfileId, input.gymId, input) });

  if (error) {
    throw new Error(`createNotification failed: ${error.message}`);
  }
  return { id };
}

/**
 * Fan out one notification to every profile holding `role` within `gymId`
 * (e.g. notify all `receptionist`/`owner`). No rows are created outside the
 * gym. Returns the recipients reached.
 */
export async function createNotificationForRole(
  input: CreateNotificationForRoleInput,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<{ count: number; recipientIds: string[] }> {
  const supabase = client ?? (await createClient());

  const { data: holders, error: holdersError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', input.role)
    .eq('gym_id', input.gymId);

  if (holdersError) {
    throw new Error(`createNotificationForRole failed: ${holdersError.message}`);
  }
  if (!holders || holders.length === 0) {
    return { count: 0, recipientIds: [] };
  }

  const recipientIds = [...new Set(holders.map((h) => h.user_id))];
  const rows = recipientIds.map((userId) => buildRow(userId, input.gymId, input));

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) {
    throw new Error(`createNotificationForRole failed: ${insertError.message}`);
  }

  return { count: recipientIds.length, recipientIds };
}
