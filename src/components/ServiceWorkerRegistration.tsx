"use client";

import { useEffect } from "react";
import { initSyncEngineListeners } from "@/lib/sync-engine";
import { initNativeAlarmListeners, getNativeFCMToken } from "@/lib/native-alarm";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Initialize Native Alarm Listeners (Android OS Action Buttons)
    initNativeAlarmListeners();

    // 2. Hardware Back Button & App State change handlers for Android Native App
    if (Capacitor.isNativePlatform()) {
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack && window.location.pathname !== '/') {
          window.history.back();
        } else {
          App.exitApp();
        }
      }).catch((err) => {
        console.warn('[CAPACITOR BACK BUTTON] Error registering back button listener:', err);
      });

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('[NATIVE APP STATE] App activated — triggering sync and alarm reconciliation');
          initSyncEngineListeners();
        }
      }).catch((err) => {
        console.warn('[CAPACITOR APP STATE] Error registering appStateChange listener:', err);
      });
    }

    // 3. Initialize Global Sync Engine Listeners (online event, visibility change)
    initSyncEngineListeners();

    // 4. Background Dev Cron Poller for Local Testing (Triggers scheduler every 30 seconds in dev mode only)
    let pollerInterval: NodeJS.Timeout | null = null;
    if (process.env.NODE_ENV === 'development' && !Capacitor.isNativePlatform() && navigator.onLine) {
      pollerInterval = setInterval(() => {
        if (!navigator.onLine) return;
        fetch('/api/cron/reminders')
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.foundCount > 0) {
              console.log(`[DEV CRON POLLER] Scheduler executed: Found=${data.foundCount}, PushSuccess=${data.successPushCount}`);
            }
          })
          .catch(() => {});
      }, 30000);

      // Initial dev trigger immediately on page load if online
      fetch('/api/cron/reminders').catch(() => {});
    }

    // 5. Service Worker & Native FCM Registration
    const registerNativeFCM = async () => {
      if (!Capacitor.isNativePlatform() || !navigator.onLine) return;
      try {
        const fcmToken = await getNativeFCMToken();
        if (fcmToken) {
          console.log('[NATIVE FCM] Syncing Android FCM token to push_subscribers');
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription: {
                endpoint: `https://fcm.googleapis.com/fcm/send/${fcmToken}`,
                fcm_token: fcmToken,
                keys: { p256dh: 'native_fcm', auth: 'native_fcm' }
              },
              fcm_token: fcmToken,
              deviceInfo: {
                userAgent: navigator.userAgent,
                platform: 'Android Native App'
              }
            })
          }).catch((e) => console.warn('[NATIVE FCM] Direct subscribe notice:', e));
        }
      } catch (fcmErr) {
        console.warn('[NATIVE FCM] Registration notice:', fcmErr);
      }
    };

    // Trigger direct Android FCM registration
    if (Capacitor.isNativePlatform()) {
      registerNativeFCM();
    }

    if (!('serviceWorker' in navigator)) {
      return () => { if (pollerInterval) clearInterval(pollerInterval); };
    }

    const registerSW = async () => {
      try {
        const swUrl = new URL('/sw.js', window.location.origin).href;
        const registration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
        console.log('[ServiceWorker v6] Registered with scope:', registration.scope);

        // Check for updates on every page load
        registration.update().catch(() => {});

        // Auto-sync Web Push / FCM subscription for ALL devices (PC, Android, etc.)
        if ('PushManager' in window && 'Notification' in window && navigator.onLine && !Capacitor.isNativePlatform()) {
          let currentPerm = Notification.permission;
          if (currentPerm === 'default') {
            try {
              currentPerm = await Notification.requestPermission();
            } catch (pErr) {
              console.warn('[ServiceWorker v6] Permission request notice:', pErr);
            }
          }

          if (currentPerm === 'granted') {
            const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (vapidPublicKey) {
              let sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: (() => {
                  const padding = '='.repeat((4 - vapidPublicKey.length % 4) % 4);
                  const base64 = (vapidPublicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
                  const rawData = window.atob(base64);
                  const outputArray = new Uint8Array(rawData.length);
                  for (let i = 0; i < rawData.length; ++i) {
                    outputArray[i] = rawData.charCodeAt(i);
                  }
                  return outputArray;
                })()
              }).catch(() => null);

              if (!sub) {
                sub = await registration.pushManager.getSubscription();
              }

              if (sub) {
                const subJSON = sub.toJSON();
                if (Capacitor.isNativePlatform()) {
                  const fcmToken = await getNativeFCMToken();
                  if (fcmToken) {
                    (subJSON as any).fcm_token = fcmToken;
                  }
                }

                await fetch('/api/push/subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    subscription: subJSON,
                    deviceInfo: {
                      userAgent: navigator.userAgent,
                      platform: Capacitor.isNativePlatform() ? 'Android Native App' : navigator.platform
                    }
                  })
                }).catch(() => {});
              }
            }
          }
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[ServiceWorker v6] New Service Worker version installed and ready.');
              }
            };
          }
        });
      } catch (err) {
        console.error('[ServiceWorker v6] Registration failed:', err);
      }
    };

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => window.removeEventListener('load', registerSW);
    }
  }, []);

  return null;
}
