// Service Worker for AgendaRecap Pro
// Offline Background Notifications & Web Push Engine

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Cache for offline reminders
let cachedReminders = [];
let firedRemindersMap = {};

// Background Offline Timer (Runs every 25 seconds)
setInterval(() => {
  if (!cachedReminders || cachedReminders.length === 0) return;

  const now = new Date();
  const currentHHmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const dayOfWeek = now.getDay();

  cachedReminders.forEach((r) => {
    if (!r.isActive) return;
    if (r.time !== currentHHmm) return;

    let shouldNotify = false;
    if (r.frequency === 'once') {
      const createdDate = new Date(r.createdAt).toDateString();
      if (createdDate === now.toDateString()) {
        shouldNotify = true;
      }
    } else if (r.frequency === 'daily') {
      shouldNotify = true;
    } else if (r.frequency === 'weekdays' && dayOfWeek !== 0 && dayOfWeek !== 6) {
      shouldNotify = true;
    } else if (r.frequency === 'weekly' && r.daysOfWeek && r.daysOfWeek.includes(dayOfWeek)) {
      shouldNotify = true;
    }

    if (shouldNotify) {
      const fireKey = `${r.id}_${now.toDateString()}_${currentHHmm}`;
      if (firedRemindersMap[fireKey]) return; // Prevent duplicate popup in the same minute

      firedRemindersMap[fireKey] = true;

      const options = {
        body: `Waktu pengingat Anda (${r.time}) telah tiba! (Mode Offline / Background)`,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: `reminder-offline-${r.id}`,
        requireInteraction: true, // STICKY POPUP ON PC & ANDROID OS
        renotify: true,
        vibrate: [300, 100, 300, 100, 300, 100, 300],
        data: '/',
        actions: [
          { action: 'open', title: 'Buka Agenda' },
          { action: 'close', title: 'Selesai' }
        ]
      };

      self.registration.showNotification(r.title, options);
    }
  });
}, 25000);

// Handle Online Server Push Events (VAPID / FCM)
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
    tag: data.tag || `reminder-push-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
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

// Handle Messages from Client Web App
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SYNC_REMINDERS') {
    if (Array.isArray(event.data.reminders)) {
      cachedReminders = event.data.reminders;
    }
  }

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
