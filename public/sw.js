// Service Worker for AgendaRecap / Agendaku PWA
// Offline Shell Caching, Web Push Notification, Actions (Snooze 5m/15m/1h, Close, Open), & Background Sync

const CACHE_NAME = 'agendaku-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/reminders',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/file.svg',
  '/globe.svg'
];

let cachedReminders = [];
let firedRemindersMap = {};

// 1. Install Event - Cache Application Shell & Skip Waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-caching some assets failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event - Clean Up Old Caches & Claim Clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Stale-While-Revalidate Network Strategy for PWA Offline Mode
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip caching API calls or chrome-extension requests
  if (url.pathname.startsWith('/api/') || url.protocol === 'chrome-extension:') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse || caches.match('/');
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Web Push Event - Receive Server Push Notifications
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'Pengingat Agendaku',
      body: event.data ? event.data.text() : 'Anda memiliki agenda yang perlu diperhatikan.'
    };
  }

  const reminderId = data.id || `push-${Date.now()}`;
  const title = data.title || 'Pengingat AgendaRecap';
  const body = data.body || 'Waktu pengingat Anda telah tiba!';
  const notificationTag = data.tag || `reminder-${reminderId}`;

  const options = {
    body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: notificationTag,
    requireInteraction: true, // STICKY OS POPUP ON PC & ANDROID
    renotify: true,
    vibrate: [300, 100, 300, 100, 300, 100, 300],
    data: {
      reminderId,
      url: data.url || '/reminders'
    },
    actions: data.actions || [
      { action: 'open', title: '📂 OPEN' },
      { action: 'snooze_5', title: '⏱ 5 MIN' },
      { action: 'snooze_15', title: '⏱ 15 MIN' },
      { action: 'snooze_60', title: '⏱ 1 HOUR' },
      { action: 'close', title: '❌ CLOSE' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notification Click Handler - Handles Open, Snooze (5m, 15m, 1h), and Close
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId || event.notification.tag.replace('reminder-', '');

  // Handle Snooze Actions (5 MIN, 15 MIN, 1 HOUR)
  if (action === 'snooze_5' || action === 'snooze_15' || action === 'snooze_60') {
    let minutes = 5;
    if (action === 'snooze_15') minutes = 15;
    if (action === 'snooze_60') minutes = 60;

    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes })
      }).catch((err) => {
        console.warn('Snooze sync offline, will retry when back online:', err);
      })
    );
    return;
  }

  // Handle Close / Dismiss Action
  if (action === 'close') {
    event.waitUntil(
      fetch(`/api/reminders/${reminderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' })
      }).catch((err) => {
        console.warn('Dismiss sync offline:', err);
      })
    );
    return;
  }

  // Handle Default or "OPEN" Action - Focus/Open App Window
  if (action === 'open' || !action) {
    const urlToOpen = new URL(notificationData.url || '/reminders', self.location.origin).href;

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
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

// 6. Notification Close Event
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification was closed by user', event.notification.tag);
});

// 7. Background Sync Event - Sync Offline Queue when Connection Restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reminders' || event.tag === 'sync-snooze') {
    event.waitUntil(
      fetch('/api/push/cron', { method: 'POST' }).catch((err) => {
        console.warn('Background sync failed:', err);
      })
    );
  }
});

// 8. Handle Messages from Web App Client
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SYNC_REMINDERS') {
    if (Array.isArray(event.data.reminders)) {
      cachedReminders = event.data.reminders;
    }
  }

  if (event.data.type === 'TEST_BACKGROUND_PUSH') {
    const delay = event.data.delayMs || 3000;
    const title = event.data.title || 'Uji Background Push SW';
    const body = event.data.body || 'Notifikasi ini terpicu otomatis saat aplikasi tertutup (Background SW).';

    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'test-background-push',
        requireInteraction: true,
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { url: '/reminders' },
        actions: [
          { action: 'open', title: '📂 OPEN' },
          { action: 'snooze_5', title: '⏱ 5 MIN' },
          { action: 'snooze_15', title: '⏱ 15 MIN' },
          { action: 'snooze_60', title: '⏱ 1 HOUR' },
          { action: 'close', title: '❌ CLOSE' }
        ]
      });
    }, delay);
  }
});

// 9. Offline Background Fallback Interval (Runs every 25 seconds when browser process active)
setInterval(() => {
  if (!cachedReminders || cachedReminders.length === 0) return;

  const now = new Date();
  const currentHHmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const dayOfWeek = now.getDay();

  cachedReminders.forEach((r) => {
    if (!r.isActive && r.status !== 'scheduled' && r.status !== 'snoozed') return;
    if (r.time !== currentHHmm) return;

    let shouldNotify = false;
    if (r.frequency === 'once') {
      const createdDate = new Date(r.createdAt || r.created_at).toDateString();
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

      self.registration.showNotification(r.title, {
        body: `Waktu pengingat Anda (${r.time}) telah tiba! (Local Offline Mode)`,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: `reminder-${r.id}`,
        requireInteraction: true,
        renotify: false,
        vibrate: [300, 100, 300, 100, 300, 100, 300],
        data: { reminderId: r.id, url: '/reminders' },
        actions: [
          { action: 'open', title: '📂 OPEN' },
          { action: 'snooze_5', title: '⏱ 5 MIN' },
          { action: 'snooze_15', title: '⏱ 15 MIN' },
          { action: 'snooze_60', title: '⏱ 1 HOUR' },
          { action: 'close', title: '❌ CLOSE' }
        ]
      });
    }
  });
}, 25000);
