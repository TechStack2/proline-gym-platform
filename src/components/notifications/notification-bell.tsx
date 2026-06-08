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
  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      channel = supabase
        .channel(`notifications:${user.id}`)
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
        className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 relative transition-colors"
        aria-label={locale === 'ar' ? 'الإشعارات' : locale === 'fr' ? 'Notifications' : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
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
