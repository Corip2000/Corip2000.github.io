/* WhereApp — service worker: показ уведомлений и приём push */

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
  let d = { title: 'WhereApp', body: 'Новое сообщение', tag: '' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {}

  // Уникальная метка обязательна: с одинаковой Android беззвучно подменяет
  // предыдущее уведомление, и кажется, что новые перестали приходить.
  const tag = 'wa_' + (d.tag || 'msg') + '_' + Date.now();

  e.waitUntil(self.registration.showNotification(String(d.title), {
    body: String(d.body),
    icon: 'icon.png',
    badge: 'icon.png',
    tag: tag,
    renotify: true,
    timestamp: Date.now()
  }));
});
