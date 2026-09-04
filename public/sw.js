self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push from Server (VAPID / FCM)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Pengingat AgendaRecap', body: event.data ? event.data.text() : 'Anda memiliki agenda yang perlu diperhatikan.' };
  }
  
  const title = data.title || 'Pengingat AgendaRecap';
  const options = {
    body: data.body || 'Anda memiliki pengingat jadwal yang perlu diperhatikan.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: data.url || '/',
    tag: data.tag || `reminder-${Date.now()}`,
    renotify: true,
    requireInteraction: true, // Forces notification to stay visible on PC / Android until clicked
    vibrate: [300, 100, 300, 100, 300, 100, 300],
    actions: [
      { action: 'open', title: 'Buka Agenda' },
      { action: 'close', title: 'Tutup' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click action
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        const urlToOpen = new URL(event.notification.data || '/', self.location.origin).href;
        
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// Background Timer & Test Push Messages via PostMessage
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'TEST_BACKGROUND_PUSH') {
    const delay = event.data.delayMs || 5000;
    const title = event.data.title || 'Uji Notifikasi App Tertutup';
    const body = event.data.body || 'Notifikasi ini terpicu otomatis saat aplikasi tertutup (Background SW Active).';

    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'test-background-push',
        requireInteraction: true,
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        data: '/'
      });
    }, delay);
  }
});
