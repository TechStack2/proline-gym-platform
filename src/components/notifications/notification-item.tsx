import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

type NotificationItemProps = {
  title: string;
  body: string;
  isRead: boolean;
  timeAgo: string;
  onClick: () => void;
  locale: string;
  actionUrl?: string | null;
  /** Notification `type` (e.g. pt_approved) — surfaced as a stable test hook only. */
  notificationType?: string | null;
};

export function NotificationItem({
  title,
  body,
  isRead,
  timeAgo,
  onClick,
  locale,
  actionUrl,
  notificationType,
}: NotificationItemProps) {
  const isRTL = locale === 'ar';

  return (
    <button
      onClick={onClick}
      data-testid="notification-item"
      data-notification-type={notificationType ?? undefined}
      className={cn(
        'w-full text-start px-4 py-3 flex gap-3 items-start transition-all duration-150',
        'hover:bg-gray-50 active:bg-gray-100',
        'animate-in fade-in-0 slide-in-from-top-1 duration-200',
        !isRead && 'bg-red-50/40 hover:bg-red-50/70',
        isRTL && 'flex-row-reverse text-right'
      )}
    >
      {/* Status dot */}
      <span className="mt-1.5 flex-shrink-0">
        <span
          className={cn(
            'block h-2.5 w-2.5 rounded-full',
            isRead ? 'bg-gray-300' : 'bg-red-500 shadow-sm shadow-red-200'
          )}
        />
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={cn('flex items-start gap-2', isRTL && 'flex-row-reverse')}>
          <p
            className={cn(
              'text-sm font-medium truncate flex-1',
              isRead ? 'text-gray-600' : 'text-gray-900',
              isRTL && 'font-arabic'
            )}
          >
            {title}
          </p>
          <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5 flex-shrink-0">
            {timeAgo}
          </span>
        </div>
        <p
          className={cn(
            'text-xs mt-0.5 line-clamp-1',
            isRead ? 'text-gray-400' : 'text-gray-500',
            isRTL && 'font-arabic'
          )}
        >
          {body}
        </p>
        {actionUrl && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs mt-1 text-primary-600',
              isRTL && 'flex-row-reverse'
            )}
          >
            <ExternalLink className="h-3 w-3" />
            <span>
              {locale === 'ar' ? 'عرض' : locale === 'fr' ? 'Voir' : 'View'}
            </span>
          </span>
        )}
      </div>
    </button>
  );
}
