/**
 * SimulatedProvisioning — the contained-simulation adapter (Prompt 23-R).
 *
 * Records a visible "invite sent (simulated)" row in `account_invites` and
 * returns the invite state. It performs NO external send and creates NO
 * `auth.users` row — only the credential *delivery* is stubbed, behind this
 * named interface, so swapping to a real Supabase-Auth/WhatsApp adapter later is
 * a one-file change. The member, membership, invoice and notification produced
 * by the convert are all 100% real and already propagate.
 */
import type {
  AccountProvisioning,
  InviteMemberInput,
  InviteResult,
} from './types';
import type { createClient } from '@/lib/supabase/server';

export class SimulatedProvisioning implements AccountProvisioning {
  async inviteMember(
    input: InviteMemberInput,
    client: Awaited<ReturnType<typeof createClient>>,
  ): Promise<InviteResult> {
    const channel = input.channel ?? 'whatsapp';
    const token = crypto.randomUUID();

    // Plain insert (no .select()) — the staff INSERT policy (account_invites_staff)
    // is the guardrail. We control the returned shape ourselves, so no RETURNING
    // round-trip is needed.
    const { error } = await client.from('account_invites').insert({
      gym_id: input.gymId,
      profile_id: input.profileId,
      student_id: input.studentId,
      channel,
      token,
      status: 'sent', // simulated "send" — visible to staff, nothing left the box
      provider: 'simulated',
    });

    if (error) {
      throw new Error(`provisioning(simulated) failed: ${error.message}`);
    }

    return { status: 'sent', channel, token, delivered: false };
  }
}

/** The provisioning adapter in force for this slice. Swap here in Phase 5/6. */
export const provisioning: AccountProvisioning = new SimulatedProvisioning();
