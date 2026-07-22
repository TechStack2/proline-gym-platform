'use client';

import { fmtDate } from '@/lib/fmt'
import { useState, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { renderNotification } from '@/lib/notifications/render';
import { NotificationItem } from '@/components/notifications/notification-item';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

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

type NotificationsClientProps = {
  notifications: Notification[];
  locale: string;
};

function timeAgo(date: string, locale: string, justNowLabel: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return justNowLabel;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return fmtDate(date, locale);
}

export function NotificationsClient({ notifications: initialNotifications, locale }: NotificationsClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations('notifications');
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);
  const isRTL = locale === 'ar';

  // Group by read status
  const unread = notifications.filter(n => !n.is_read);
  const read = notifications.filter(n => n.is_read);

  const handleMarkAsRead = useCallback(async (id: string, actionUrl?: string | null) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );

    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);

    if (actionUrl) {
      router.push(actionUrl);
    }
  }, [supabase, router]);

  const handleMarkAllAsRead = async () => {
    if (unread.length === 0) return;
    setMarkingAll(true);

    const unreadIds = unread.map(n => n.id);
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => (unreadIds.includes(n.id) ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );

    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);

    setMarkingAll(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader segment="notifications" />
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
        {unread.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={markingAll}
            className="text-primary-600"
          >
            <CheckCheck className="h-4 w-4" />
            <span>
              {t('markAllRead')}
            </span>
          </Button>
        )}
      </div>

      {/* Empty state — DA-31: the one primitive (calm zero). */}
      {notifications.length === 0 && (
        <EmptyState variant="bare" icon={Bell} title={t('empty')} hint={t('emptyHint')} className="py-20" />
      )}

      {/* Unread section */}
      {unread.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <h2 className={cn(
              'text-xs font-semibold uppercase tracking-wider text-red-600',
              isRTL && 'font-arabic'
            )}>
              {t('unread')}
            </h2>
            <span className="text-xs text-red-400">({unread.length})</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="notifications-unread-list">
            {unread.map(n => {
              const { title, body } = renderNotification(n, t, locale);
              return (
              <NotificationItem
                key={n.id}
                title={title}
                body={body}
                isRead={false}
                timeAgo={timeAgo(n.created_at, locale, t('justNow'))}
                onClick={() => handleMarkAsRead(n.id, n.action_url)}
                locale={locale}
                actionUrl={n.action_url}
                notificationType={n.type}
              />
              );
            })}
          </div>
        </section>
      )}

      {/* Read section */}
      {read.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <h2 className={cn(
              'text-xs font-semibold uppercase tracking-wider text-gray-400',
              isRTL && 'font-arabic'
            )}>
              {t('read')}
            </h2>
            <span className="text-xs text-gray-400">({read.length})</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="notifications-read-list">
            {read.map(n => {
              const { title, body } = renderNotification(n, t, locale);
              return (
              <NotificationItem
                key={n.id}
                title={title}
                body={body}
                isRead={true}
                timeAgo={timeAgo(n.created_at, locale, t('justNow'))}
                onClick={() => {
                  if (n.action_url) {
                    router.push(n.action_url);
                  }
                }}
                locale={locale}
                actionUrl={n.action_url}
                notificationType={n.type}
              />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
