'use client';

/**
 * Actionable inbox count for the staff nav badge (IA-1).
 *
 * Counts the pending queues the /inbox surfaces (class-registration requests +
 * PT requests) via the staff session's own RLS-scoped reads — no new RPC, no
 * producer logic. Polls lightly so the badge stays honest while staff sit on
 * another tab.
 */
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useInboxCount(): number {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [regs, pts, members] = await Promise.all([
      supabase
        .from('class_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'requested'),
      supabase
        .from('pt_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'requested'),
      // MJ-3: member self-serve requests (profile change / renewal / freeze).
      supabase
        .from('member_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]);
    setCount((regs.count ?? 0) + (pts.count ?? 0) + (members.count ?? 0));
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return count;
}
