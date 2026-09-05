// Service Worker for AgendaRecap / Agendaku PWA
// Offline Shell Caching, Web Push Notification, Actions (CLOSE, SNOOZE 5m/15m/1h), & Background Sync
// VERSION: v3 (Strict Loop-Prevention & No-OPEN Action Model)

const CACHE_NAME = 'agendaku-pwa-v3';
const STATIC_ASSETS = [
  '/',
  '/reminders',
  '/manifest.json',
  '/icon.svg'
];

// 1. Install Event - Cache Application Shell & Skip Waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching some assets failed:', err);
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
            console.log('[SW] Deleting old cache version:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Stale-While-Revalidate Strategy
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

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

// 4. Web Push Event - Receive Server Push Notifications (NO OPEN ACTION)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'Pengingat Agendaku',
      body: event.data ? event.data.text() : 'Waktu pengingat Anda telah tiba.'
    };
  }

  const reminderId = data.reminderId || data.id || `push-${Date.now()}`;
  const occurrenceId = data.occurrenceId || `occ-${Date.now()}`;
  const title = data.title || 'Pengingat AgendaRecap';
  const body = data.body || 'Waktu pengingat Anda telah tiba!';
  const notificationTag = data.notificationTag || `reminder-${reminderId}-${occurrenceId}`;
  const source = data.source || 'scheduled';

  console.log(`[SW] Push received: occurrenceId=${occurrenceId} reminderId=${reminderId} tag=${notificationTag} source=${source}`);

  const options = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: notificationTag,
    requireInteraction: true, // STICKY OS POPUP
    renotify: true,
    vibrate: [300, 100, 300, 100, 300, 100, 300],
    data: {
      reminderId,
      occurrenceId,
      scheduledAt: data.scheduledAt,
      isRecurring: data.isRecurring || false,
      source
    },
    // STRICTLY NO OPEN ACTION! ONLY CLOSE & SNOOZE
    actions: [
      { action: 'close', title: '❌ CLOSE' },
      { action: 'snooze_5', title: '⏱ 5 MIN' },
      { action: 'snooze_15', title: '⏱ 15 MIN' },
      { action: 'snooze_60', title: '⏱ 1 HOUR' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notification Click Handler - Handles CLOSE and SNOOZE (5 MIN / 15 MIN / 1 HOUR)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId || event.notification.tag.split('-')[1];
  const occurrenceId = notificationData.occurrenceId || 'unknown';

  console.log(`[SW] Notification click: action=${action} occurrenceId=${occurrenceId} reminderId=${reminderId}`);

  // Handle Snooze Actions (5 MIN, 15 MIN, 1 HOUR)
  if (action === 'snooze_5' || action === 'snooze_15' || action === 'snooze_60') {
    let minutes = 5;
    if (action === 'snooze_15') minutes = 15;
    if (action === 'snooze_60') minutes = 60;

    console.log(`[SW] Action SNOOZE: +${minutes} minutes for reminderId=${reminderId}`);

    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes })
      }).then(() => {
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SNOOZE_REMINDER',
              reminderId,
              minutes
            });
          });
        });
      }).catch((err) => {
        console.warn('[SW] Offline snooze sync:', err);
      })
    );
    return;
  }

  // Handle CLOSE Action or Click on Notification Body
  console.log(`[SW] Action CLOSE: Marking reminderId=${reminderId} occurrenceId=${occurrenceId} completed`);

  event.waitUntil(
    fetch(`/api/reminders/${reminderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', isActive: false })
    }).then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'COMPLETE_REMINDER',
            reminderId
          });
        });
      });
    }).catch((err) => {
      console.warn('[SW] Offline close sync:', err);
    })
  );
});

// 6. Notification Close Event (User presses X or swipes away notification)
self.addEventListener('notificationclose', (event) => {
  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId || event.notification.tag.split('-')[1];
  const occurrenceId = notificationData.occurrenceId || 'unknown';

  console.log(`[SW] Notification closed (X pressed): occurrenceId=${occurrenceId} reminderId=${reminderId}`);

  // Mark completed so it does NOT trigger or loop again
  event.waitUntil(
    fetch(`/api/reminders/${reminderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', isActive: false })
    }).catch((err) => {
      console.warn('[SW] Notification close sync warning:', err);
    })
  );
});

// 7. Message Event - Development Emergency Cleanup of Active Notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SW_CLEANUP_TEST_NOTIFICATIONS') {
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        let closedCount = 0;
        notifications.forEach((notification) => {
          if (notification.tag && (notification.tag.includes('test') || notification.tag.includes('reminder'))) {
            notification.close();
            closedCount++;
          }
        });
        console.log(`[SW] Emergency Cleanup: Closed ${closedCount} active notifications`);
      })
    );
  }
});
