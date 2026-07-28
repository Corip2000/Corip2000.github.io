/* WhereApp — service worker. Нужен, чтобы Android Chrome мог показывать уведомления. */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* обработчик обязателен, иначе Chrome не считает сайт устанавливаемым */
self.addEventListener('fetch', e => {});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
