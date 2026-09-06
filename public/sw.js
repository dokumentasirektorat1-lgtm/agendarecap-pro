// Service Worker for AgendaRecap Pro PWA
// Offline Shell Caching, Web Push Notification Engine, & Strict Action Handling (CLOSE, SNOOZE 5m/15m/1h)
// VERSION: v5 (Hybrid Alarm Engine, Cache Version Cleanup & Tag Standard)

const CACHE_NAME = 'agendaku-pwa-v5';
const STATIC_ASSETS = [
  '/',
  '/reminders',
  '/diagnostics',
  '/settings/notifications',
  '/manifest.json',
  '/icon.svg'
];

// 1. Install Event - Pre-cache Application Shell Assets & Skip Waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW v5] Pre-caching static shell failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event - Strict Cache Version Cleanup (Deletes v1, v2, v3, v4, etc.)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW v5] Deleting old cache version:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Stale-While-Revalidate Strategy for Application Shell
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API routes and browser extensions from HTTP caching
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

// 4. Web Push Event - Handle Server Web Push Notifications (STRICTLY NO OPEN ACTION)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'Pengingat AgendaRecap',
      body: event.data ? event.data.text() : 'Waktu pengingat Anda telah tiba.'
    };
  }

  const reminderId = data.reminderId || data.id || `push-${Date.now()}`;
  const occurrenceId = data.occurrenceId || `occ-${Date.now()}`;
  const title = data.title || 'Pengingat AgendaRecap Pro';
  const body = data.body || 'Waktu pengingat Anda telah tiba!';
  const notificationTag = data.notificationTag || `agenda-${reminderId}-${occurrenceId}`;

  console.log(`[SW v5] Push received: occurrenceId=${occurrenceId} reminderId=${reminderId} tag=${notificationTag}`);

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
      isRecurring: data.isRecurring || false
    },
    // STRICTLY NO OPEN ACTION! ONLY CLOSE & SNOOZE (5 MIN / 15 MIN / 1 HOUR)
    actions: [
      { action: 'close', title: '❌ CLOSE' },
      { action: 'snooze_5', title: '⏱ SNOOZE 5 MIN' },
      { action: 'snooze_15', title: '⏱ SNOOZE 15 MIN' },
      { action: 'snooze_60', title: '⏱ 1 HOUR' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notification Click Handler - Process CLOSE and SNOOZE (Zero OPEN Window Call)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId || event.notification.tag.split('-')[1];
  const occurrenceId = notificationData.occurrenceId || 'unknown';

  console.log(`[SW v5] Notification click: action=${action} occurrenceId=${occurrenceId} reminderId=${reminderId}`);

  // Handle Snooze Actions (5 MIN, 15 MIN, 1 HOUR)
  if (action === 'snooze_5' || action === 'snooze_15' || action === 'snooze_60') {
    let minutes = 5;
    if (action === 'snooze_15') minutes = 15;
    if (action === 'snooze_60') minutes = 60;

    console.log(`[SW v5] Action SNOOZE: +${minutes} minutes for reminderId=${reminderId} occurrenceId=${occurrenceId}`);

    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes, occurrenceId })
      }).then(() => {
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SNOOZE_OCCURRENCE',
              reminderId,
              occurrenceId,
              minutes
            });
          });
        });
      }).catch((err) => {
        console.warn('[SW v5] Offline snooze sync warning:', err);
      })
    );
    return;
  }

  // Handle Body Click (no action specified) -> Open/Focus window navigating to Agenda Detail or Reminders page
  if (!action || action === 'open' || action === '') {
    const targetUrl = notificationData.agendaId ? `/consultation?id=${notificationData.agendaId}` : (notificationData.url || '/reminders');
    console.log(`[SW v5] Body clicked -> Navigating client to ${targetUrl}`);
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
    );
    return;
  }

  // Handle CLOSE Action (Mark current occurrence/reminder completed)
  console.log(`[SW v5] Action CLOSE: Marking reminderId=${reminderId} occurrenceId=${occurrenceId} completed`);

  event.waitUntil(
    fetch(`/api/reminders/${reminderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', occurrenceId })
    }).then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'COMPLETE_OCCURRENCE',
            reminderId,
            occurrenceId
          });
        });
      });
    }).catch((err) => {
      console.warn('[SW v5] Offline close sync warning:', err);
    })
  );
});

// 6. Notification Close Event (User swipes away or clicks X on notification)
self.addEventListener('notificationclose', (event) => {
  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId || event.notification.tag.split('-')[1];
  const occurrenceId = notificationData.occurrenceId || 'unknown';

  console.log(`[SW v5] Notification closed (X pressed): occurrenceId=${occurrenceId} reminderId=${reminderId}`);

  // Mark occurrence completed/dismissed so it will NEVER trigger or loop again
  event.waitUntil(
    fetch(`/api/reminders/${reminderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed', occurrenceId })
    }).catch((err) => {
      console.warn('[SW v5] Notification close sync warning:', err);
    })
  );
});

// 7. Message Event - SW Emergency Cleanup Tool
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SW_CLEANUP_TEST_NOTIFICATIONS') {
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        let closedCount = 0;
        notifications.forEach((notification) => {
          if (notification.tag && (notification.tag.includes('test') || notification.tag.includes('reminder') || notification.tag.includes('agenda'))) {
            notification.close();
            closedCount++;
          }
        });
        console.log(`[SW v5] Emergency Cleanup: Closed ${closedCount} active notifications`);
      })
    );
  }
});
