// Service worker for web push reminders only. It caches nothing: the trainer always loads fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'Warm up before you queue';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Five minutes: today’s routine is ready.',
    icon: data.icon || '/platform/icon.png',
    tag: data.tag || 'st-reminder',
    renotify: false,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); if ('navigate' in w) w.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
