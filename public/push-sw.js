/* PUSH-1 — web-push handlers for the Proline PWA service worker.
 *
 * This file is HAND-WRITTEN and byte-stable. next-pwa regenerates public/sw.js on
 * every build; it pulls this file in via workbox `importScripts` (next.config.mjs),
 * so the generated sw.js changes only by the added importScripts line (+ the
 * cacheId bump), keeping the PWA-UPDATE succession diff minimal and reviewable.
 *
 * Payloads are PII-light (see src/lib/push/payload.ts): a category-generic title/
 * body + a deep link. The click opens/focuses the app at that link. */

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  var title = data.title || 'Proline';
  var options = {
    body: data.body || '',
    tag: data.tag || 'proline',
    renotify: true,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    data: { url: data.url || '/notifications' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) { try { client.navigate(url); } catch (e) { /* cross-origin/navigation guard */ } }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
