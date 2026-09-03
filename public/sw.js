self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const title = data.title || 'Pengingat Internal';
  const options = {
    body: data.body || 'Anda memiliki agenda yang memerlukan perhatian.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: data.url || '/',
    requireInteraction: true, // Forces notification to persist until clicked or dismissed
    vibrate: [200, 100, 200, 100, 200, 100, 200], // Urgent vibration pattern
    actions: [
      { action: 'open', title: 'Buka Aplikasi' },
      { action: 'close', title: 'Selesai' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        const urlToOpen = new URL(event.notification.data, self.location.origin).href;
        
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
