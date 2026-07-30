/* WhereApp — service worker.

   Главное правило: уведомление обязано быть показано ВСЕГДА и быстро.
   Если push-событие завершится без показа, iOS и Android считают это
   нарушением и со временем отзывают подписку. Поэтому расшифровка текста
   идёт с жёстким таймаутом, а при любой заминке показывается заглушка. */

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

function unb64(s) {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function idbGet(key) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    try {
      const r = indexedDB.open('whereapp', 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('keys')) r.result.createObjectStore('keys');
      };
      r.onsuccess = () => {
        try {
          const q = r.result.transaction('keys', 'readonly').objectStore('keys').get(key);
          q.onsuccess = () => finish(q.result || null);
          q.onerror = () => finish(null);
        } catch (e) { finish(null); }
      };
      r.onerror = () => finish(null);
      r.onblocked = () => finish(null);
    } catch (e) { finish(null); }
  });
}

async function decryptText(chatId, ct, iv) {
  const raw = await idbGet(chatId);
  if (!raw) return null;
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return new TextDecoder().decode(buf);
}

// Никакая операция не имеет права подвесить показ уведомления
function withTimeout(promise, ms) {
  return Promise.race([
    promise.catch(() => null),
    new Promise(r => setTimeout(() => r(null), ms))
  ]);
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let d = { title: 'WhereApp', body: 'Новое сообщение' };
    try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {}

    const fallback = String(d.body || 'Новое сообщение');
    let body = fallback;
    let decoded = false;

    if (d.ct && d.iv && d.chatId) {
      const text = await withTimeout(decryptText(d.chatId, d.ct, d.iv), 1500);
      if (text) {
        body = (d.group && d.sender) ? d.sender + ': ' + text : text;
        decoded = true;
      }
    }

    // Метка = идентификатор сообщения: разная у разных сообщений (иначе система
    // беззвучно подменяет предыдущее) и общая с локальным показом, чтобы одно
    // сообщение не показалось дважды.
    const tag = 'wa_' + (d.tag || ('m' + Date.now()));

    // Если приложение уже показало это сообщение с текстом — не затираем заглушкой
    if (!decoded) {
      const same = await withTimeout(self.registration.getNotifications({ tag }), 400);
      if (same && same.length) return;
    }

    const opts = { body: body, tag: tag, icon: d.icon || 'icon.png', badge: 'icon.png' };
    try {
      await self.registration.showNotification(String(d.title || 'WhereApp'), opts);
    } catch (err) {
      // Какая-то из настроек не поддержана — показываем самый простой вариант
      await self.registration.showNotification(String(d.title || 'WhereApp'), { body: body });
    }
  })());
});
