/* WhereApp — service worker.
   На Android Chrome конструктор new Notification() запрещён,
   уведомления показывает регистрация service worker.
   Он же принимает push при закрытом браузере. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('push', e => {
  let d = { title: 'WhereApp', body: 'Новое сообщение' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {}
  e.waitUntil(self.registration.showNotification(String(d.title), {
    body: String(d.body),
    icon: 'icon.png',
    badge: 'icon.png',
    tag: 'whereapp'
  }));
});
