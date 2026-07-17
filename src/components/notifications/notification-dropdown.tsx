'use client';

import { dateLocale } from '@/lib/utils/locale-format'
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { renderNotification } from '@/lib/notifications/render';
import { NotificationItem } from './notification-item';
import { ChevronRight, Bell } from 'lucide-react';

type Notification = {
  id: string;
  user_id: string;
  type?: string | null;
  title_ar?: string | null;
  title_en?: string | null;
  title_fr?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  body_fr?: string | null;
  title_key?: string | null;
  body_key?: string | null;
  params?: Record<string, unknown> | null;
  action_url?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
};

type NotificationDropdownProps = {
  locale: string;
  open: boolean;
  onClose: () => void;
};

function timeAgo(date: string, locale: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return locale === 'ar' ? 'الآن' : locale === 'fr' ? "À l'instant" : 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString(dateLocale(locale));
}

export function NotificationDropdown({ locale, open, onClose }: NotificationDropdownProps) {
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations('notifications');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const isRTL = locale === 'ar';

  // Fetch on mount and when open changes
  useEffect(() => {
    if (!open) return;

    async function fetchNotifications() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15);

      setNotifications((data as Notification[]) || []);
      setLoading(false);
    }

    fetchNotifications();
  }, [open, supabase]);

  // Realtime: while the dropdown is open, prepend notifications as they arrive.
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      channel = supabase
        .channel(`notifications-dropdown:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setNotifications(prev => [payload.new as Notification, ...prev].slice(0, 15));
          }
        )
        .subscribe();
    })();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [open, supabase]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const markAsRead = async (id: string, actionUrl?: string | null) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);

    // Update local state
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );

    if (actionUrl) {
      router.push(actionUrl);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={dropdownRef}
      data-testid="notification-dropdown"
      className={cn(
        'bg-white rounded-2xl shadow-xl border border-gray-100',
        'z-50 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200',
        // PWA-BASICS R3: at narrow widths the bell is inset from the edge by the
        // trailing header actions, so a fixed-width panel anchored to the bell
        // spilled off-screen (LTR left, RTL right). On mobile pin the panel to the
        // VIEWPORT edge (never the inset bell) and clamp the width to the viewport;
        // from sm up, anchor under the bell as before. RTL flips the pinned side.
        'w-[calc(100vw-1rem)] max-w-sm sm:w-96 sm:max-w-none',
        'fixed top-[calc(env(safe-area-inset-top,0px)+3.5rem)] sm:absolute sm:top-full sm:mt-2',
        isRTL
          ? 'left-2 sm:left-0 sm:right-auto'
          : 'right-2 sm:right-0 sm:left-auto'
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-4 py-3 border-b border-gray-100',
        isRTL && 'flex-row-reverse'
      )}>
        <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          {locale === 'ar' ? 'الإشعارات' : locale === 'fr' ? 'Notifications' : 'Notifications'}
        </h3>
        <span className="text-xs text-gray-400">
          {notifications.filter(n => !n.is_read).length > 0
            ? (locale === 'ar'
                ? `${notifications.filter(n => !n.is_read).length} جديدة`
                : locale === 'fr'
                  ? `${notifications.filter(n => !n.is_read).length} nouvelles`
                  : `${notifications.filter(n => !n.is_read).length} new`)
            : (locale === 'ar' ? 'الكل مقروء' : locale === 'fr' ? 'Tout lu' : 'All read')}
        </span>
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto" data-testid="notification-dropdown-list">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-2.5 w-2.5 mt-1.5 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Bell className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">
              {locale === 'ar' ? 'لا توجد إشعارات' : locale === 'fr' ? 'Aucune notification' : 'No notifications'}
            </p>
          </div>
        ) : (
          notifications.map(n => {
            const { title, body } = renderNotification(n, t, locale);
            return (
            <NotificationItem
              key={n.id}
              title={title}
              body={body}
              isRead={n.is_read}
              timeAgo={timeAgo(n.created_at, locale)}
              onClick={() => markAsRead(n.id, n.action_url)}
              locale={locale}
              actionUrl={n.action_url}
              notificationType={n.type}
            />
            );
          })
        )}
      </div>

      {/* View all link */}
      {notifications.length > 0 && (
        <button
          onClick={() => {
            router.push('/notifications');
            onClose();
          }}
          className={cn(
            'w-full px-4 py-3 border-t border-gray-100 text-sm text-primary-600',
            'hover:bg-primary-50 transition-colors font-medium',
            'flex items-center justify-center gap-1',
            isRTL && 'flex-row-reverse'
          )}
        >
          <span>
            {locale === 'ar' ? 'عرض الكل' : locale === 'fr' ? 'Voir tout' : 'View all'}
          </span>
          <ChevronRight className={cn('h-4 w-4', isRTL && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
