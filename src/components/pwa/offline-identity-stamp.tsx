'use client';

/**
 * W2c §5/DA-59 — stamp the USER's gym identity + locale for the offline door.
 *
 * public/offline.html is a static file (it cannot resolve a gym), so the authed
 * shells write a tiny localStorage stamp `{n: gymName, l: locale}` that the door
 * reads to show the CACHED gym name (+ monogram tile) and to fall back to the
 * cached locale when the requested path carries none. Renders nothing; writes on
 * mount and whenever the identity changes. A private-mode localStorage throw is
 * swallowed — the door then simply stays neutral.
 */
import { useEffect } from 'react';

export function OfflineIdentityStamp({ gymName, locale }: { gymName?: string; locale: string }) {
  useEffect(() => {
    try {
      const name = (gymName || '').trim();
      localStorage.setItem('praxella_offline_identity', JSON.stringify({ n: name, l: locale }));
    } catch {
      /* private mode — the offline door stays neutral */
    }
  }, [gymName, locale]);
  return null;
}
