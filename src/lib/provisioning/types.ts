/**
 * Account provisioning seam (Cycle 5 / Prompt 23-R / journey §5).
 *
 * The Lead→Member convert creates a REAL, login-less member (profile + student +
 * membership + invoice) that propagates to every staff-facing surface with zero
 * auth dependency. Delivering the member's *login credential* is a separate,
 * swappable concern modelled here.
 *
 *  - `SimulatedProvisioning` (this slice): records a visible "invite sent
 *    (simulated)" state in `account_invites`. NO external send, NO `auth.users`
 *    row. Deterministic → behavior-testable in CI with no external dependency.
 *  - `RealProvisioning` (Phase 5/6): swaps the body to call Supabase Auth invite
 *    (magic-link / phone OTP) and/or WhatsApp Cloud API, then reconciles the auth
 *    identity with the existing profile. One-file adapter swap — the convert
 *    action calls this interface, never a concrete impl directly.
 */
import type { createClient } from '@/lib/supabase/server';

export type InviteChannel = 'whatsapp' | 'email' | 'sms';
export type InviteStatus = 'pending' | 'sent' | 'accepted' | 'revoked';

export type InviteMemberInput = {
  profileId: string;
  studentId: string;
  gymId: string;
  channel?: InviteChannel;
};

export type InviteResult = {
  status: InviteStatus;
  channel: InviteChannel;
  token: string;
  /** Whether a real credential was delivered. Always false for the simulated adapter. */
  delivered: boolean;
};

export interface AccountProvisioning {
  /**
   * Provision a login for a member and "send" the invite over `channel`. The
   * action passes its already-authenticated staff client so the write is RLS-
   * scoped to the staff caller's gym.
   */
  inviteMember(
    input: InviteMemberInput,
    client: Awaited<ReturnType<typeof createClient>>,
  ): Promise<InviteResult>;
}
