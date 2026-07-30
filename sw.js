/* WhereApp — service worker.
   Показывает уведомления и расшифровывает текст прямо на устройстве:
   сервер передаёт только шифротекст, ключ берётся из локального
   хранилища IndexedDB, куда его положило само приложение. */

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

function idbGet(key) {
  return new Promise(resolve => {
    try {
      const r = indexedDB.open('whereapp', 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('keys')) r.result.createObjectStore('keys');
      };
      r.onsuccess = () => {
        try {
          const t = r.result.transaction('keys', 'readonly');
          const q = t.objectStore('keys').get(key);
          q.onsuccess = () => resolve(q.result || null);
          q.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      };
      r.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

function unb64(s) {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

async function decryptText(chatId, ct, iv) {
  try {
    const raw = await idbGet(chatId);
    if (!raw) return null;
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    return new TextDecoder().decode(buf);
  } catch (e) { return null; }
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let d = { title: 'WhereApp', body: 'Новое сообщение' };
    try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {}

    let body = String(d.body || 'Новое сообщение');

    // Пытаемся показать настоящий текст — расшифровка идёт только здесь, на устройстве
    if (d.ct && d.iv && d.chatId) {
      const text = await decryptText(d.chatId, d.ct, d.iv);
      if (text) body = d.group && d.sender ? d.sender + ': ' + text : text;
    }

    // Метка = идентификатор сообщения. Разная для разных сообщений (иначе Android
    // беззвучно подменяет предыдущее) и одинаковая для локального показа и push,
    // чтобы одно и то же сообщение не пришло дважды.
    const tag = 'wa_' + (d.tag || ('m' + Date.now()));
    const decoded = body !== String(d.body || 'Новое сообщение');

    // Если приложение уже показало это сообщение с настоящим текстом,
    // не затираем его обобщённой заглушкой.
    try {
      const same = await self.registration.getNotifications({ tag });
      if (same.length && !decoded) return;
    } catch (err) {}

    await self.registration.showNotification(String(d.title), {
      body: body,
      icon: d.icon || 'icon.png',
      badge: 'icon.png',
      tag: tag,
      renotify: true,
      timestamp: Date.now(),
      data: { chatId: d.chatId || null }
    });
  })());
});
