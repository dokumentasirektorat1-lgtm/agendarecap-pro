// Service Worker for AgendaRecap Pro PWA
// Offline Shell Caching, Web Push Notification Engine, & Strict Action Handling (CLOSE, SNOOZE 5m/15m/1h)
// VERSION: v6 (Hybrid Alarm Engine, Cache Version Cleanup & Web Push Client Recovery)

const CACHE_NAME = 'agendaku-pwa-v6';
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
        console.warn('[SW v6] Pre-caching static shell failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event - Strict Cache Version Cleanup (Deletes v1, v2, v3, v4, v5, etc.)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW v6] Deleting old cache version:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Stale-While-Revalidate Strategy with Safe Navigation Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API routes, webpack-hmr, and browser extensions from HTTP caching
  if (
    url.pathname.startsWith('/api/') || 
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.protocol === 'chrome-extension:'
  ) return;

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
          if (cachedResponse) return cachedResponse;
          // ONLY fall back to HTML shell for page navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return Response.error();
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

  console.log(`[SW v6] Push event received: occurrenceId=${occurrenceId} reminderId=${reminderId} tag=${notificationTag}`);

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
      agendaId: data.agendaId
    },
    // STRICTLY NO OPEN ACTION! ONLY CLOSE & SNOOZE (5 MIN / 15 MIN / 1 HOUR)
    actions: [
      { action: 'close', title: '❌ CLOSE' },
      { action: 'snooze_5', title: '⏱ SNOOZE 5 MIN' },
      { action: 'snooze_15', title: '⏱ SNOOZE 15 MIN' },
      { action: 'snooze_60', title: '⏱ 1 HOUR' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      console.log(`[SW v6] Notification displayed successfully: tag=${notificationTag}`);
    }).catch((err) => {
      console.error(`[SW v6] showNotification failed:`, err);
    })
  );
});

// In-memory set to prevent notificationclose race conditions when an explicit click action is handled
const handledTags = new Set();

// 5. Notification Click Handler - Process CLOSE and SNOOZE (Zero OPEN Window Call)
self.addEventListener('notificationclick', (event) => {
  const notificationTag = event.notification.tag;
  if (notificationTag) {
    handledTags.add(notificationTag);
    setTimeout(() => handledTags.delete(notificationTag), 10000);
  }

  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId || (notificationTag ? notificationTag.split('-')[1] : null);
  const occurrenceId = notificationData.occurrenceId || (notificationTag ? notificationTag.split('-')[2] : 'unknown');

  console.log(`[SW v6] Notification click: action="${action}" occurrenceId=${occurrenceId} reminderId=${reminderId}`);

  // Handle Snooze Actions (5 MIN, 15 MIN, 1 HOUR)
  if (action === 'snooze_5' || action === 'snooze_15' || action === 'snooze_60') {
    let minutes = 5;
    if (action === 'snooze_15') minutes = 15;
    if (action === 'snooze_60') minutes = 60;

    console.log(`[SW v6] Action SNOOZE: +${minutes} minutes for reminderId=${reminderId} occurrenceId=${occurrenceId}`);

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
        console.warn('[SW v6] Offline snooze sync warning:', err);
      })
    );
    return;
  }

  // Handle Body Click (no action button pressed) -> Open/Focus window
  if (!action || action === 'open' || action === '') {
    const targetUrl = notificationData.agendaId ? `/consultation?id=${notificationData.agendaId}` : (notificationData.url || '/reminders');
    console.log(`[SW v6] Body clicked -> Navigating client to ${targetUrl}`);
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
  console.log(`[SW v6] Action CLOSE: Marking reminderId=${reminderId} occurrenceId=${occurrenceId} completed`);

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
      console.warn('[SW v6] Offline close sync warning:', err);
    })
  );
});

// 6. Notification Close Event (User swipes away or clicks X on notification OS pop-up)
self.addEventListener('notificationclose', (event) => {
  const notificationTag = event.notification.tag;
  if (notificationTag && handledTags.has(notificationTag)) {
    console.log(`[SW v6] Notification close event ignored (action already handled for tag=${notificationTag})`);
    return;
  }

  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId || (notificationTag ? notificationTag.split('-')[1] : null);
  const occurrenceId = notificationData.occurrenceId || (notificationTag ? notificationTag.split('-')[2] : 'unknown');

  console.log(`[SW v6] Notification closed by OS (swipe/X): occurrenceId=${occurrenceId} reminderId=${reminderId}`);

  event.waitUntil(
    fetch(`/api/reminders/${reminderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed', occurrenceId })
    }).catch((err) => {
      console.warn('[SW v6] Notification close sync warning:', err);
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
        console.log(`[SW v6] Emergency Cleanup: Closed ${closedCount} active notifications`);
      })
    );
  }
});
