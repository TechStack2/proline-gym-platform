'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Bell } from 'lucide-react';
import { NotificationDropdown } from './notification-dropdown';

type NotificationBellProps = {
  locale: string;
};

export function NotificationBell({ locale }: NotificationBellProps) {
  const router = useRouter();
  const supabase = createClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isRTL = locale === 'ar';

  // Fetch unread count
  const fetchUnreadCount = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (!error && count !== null) {
      setUnreadCount(count);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchUnreadCount();
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Realtime: increment the badge the moment a notification is inserted for
  // this user — no refresh, no waiting for the 30s poll (state visibility).
  //
  // NB: the channel TOPIC must be unique PER MOUNT. supabase-js returns the
  // existing channel instance for a reused topic, so when the bell mounts more
  // than once (the (dashboard) double-shell renders both the mobile and desktop
  // headers; React strict-mode also re-mounts), a topic like
  // `notifications:${user.id}` makes the second mount call `.on()` on an
  // ALREADY-SUBSCRIBED channel → "cannot add postgres_changes callbacks after
  // subscribe()". Recipient scoping lives in the `filter`, not the topic, so a
  // random per-mount suffix changes nothing about what is received.
  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // getUser resolves async — the component may already be unmounted.
      if (!user || !mounted) return;

      const ch = supabase
        .channel(`notifications:${user.id}:${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => setUnreadCount(prev => prev + 1)
        )
        .subscribe();

      if (!mounted) {
        // Unmounted between creation and here — drop the channel immediately.
        supabase.removeChannel(ch);
        return;
      }
      channel = ch;
    })();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleBellClick = () => {
    setDropdownOpen(prev => !prev);
  };

  const handleNavigateToNotifications = () => {
    setDropdownOpen(false);
    router.push('/notifications');
  };

  return (
    <div className="relative">
      <button
        onClick={handleBellClick}
        data-testid="notification-bell"
        className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 relative transition-colors"
        aria-label={locale === 'ar' ? 'الإشعارات' : locale === 'fr' ? 'Notifications' : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-bell-badge"
            className={cn(
              'absolute -top-1 -right-1 min-w-[18px] h-[18px]',
              'flex items-center justify-center',
              'rounded-full bg-red-500 text-white text-[10px] font-bold',
              'leading-none px-1',
              'animate-in fade-in-0 zoom-in-95 duration-200'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationDropdown
        locale={locale}
        open={dropdownOpen}
        onClose={() => setDropdownOpen(false)}
      />
    </div>
  );
}
