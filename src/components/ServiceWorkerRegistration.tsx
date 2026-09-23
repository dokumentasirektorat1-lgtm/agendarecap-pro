"use client";

import { useEffect } from "react";
import { initSyncEngineListeners } from "@/lib/sync-engine";
import { initNativeAlarmListeners } from "@/lib/native-alarm";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Initialize Native Alarm Listeners (Android OS Action Buttons)
    initNativeAlarmListeners();

    // 2. Hardware Back Button handler for Android Native App
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
    }

    // 3. Initialize Global Sync Engine Listeners (online event, visibility change)
    initSyncEngineListeners();

    // 4. Background Dev Cron Poller for Local Testing (Triggers scheduler every 30 seconds)
    const pollerInterval = setInterval(() => {
      fetch('/api/cron/reminders')
        .then(res => res.json())
        .then(data => {
          if (data && data.foundCount > 0) {
            console.log(`[DEV CRON POLLER] Scheduler executed: Found=${data.foundCount}, PushSuccess=${data.successPushCount}`);
          }
        })
        .catch(() => {});
    }, 30000);

    // Initial dev trigger immediately on page load
    fetch('/api/cron/reminders').catch(() => {});

    // 5. Service Worker Registration (Web Push & Offline Fallback)
    if (!('serviceWorker' in navigator)) {
      return () => clearInterval(pollerInterval);
    }

    const registerSW = async () => {
      try {
        const swUrl = new URL('/sw.js', window.location.origin).href;
        const registration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
        console.log('[ServiceWorker v6] Registered with scope:', registration.scope);

        // Check for updates on every page load
        registration.update().catch(() => {});

        // Auto-sync Web Push subscription for ALL devices (PC, Android, etc.)
        if ('PushManager' in window && 'Notification' in window) {
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
              let sub = await registration.pushManager.getSubscription();
              if (!sub) {
                const urlBase64ToUint8Array = (base64String: string) => {
                  const padding = '='.repeat((4 - base64String.length % 4) % 4);
                  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                  const rawData = window.atob(base64);
                  const outputArray = new Uint8Array(rawData.length);
                  for (let i = 0; i < rawData.length; ++i) {
                    outputArray[i] = rawData.charCodeAt(i);
                  }
                  return outputArray;
                };
                sub = await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
                });
              }

              if (sub) {
                await fetch('/api/push/subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    subscription: sub,
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
