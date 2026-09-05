"use client";

import { useEffect } from "react";
import { initSyncEngineListeners } from "@/lib/sync-engine";
import { initNativeAlarmListeners } from "@/lib/native-alarm";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize Native Alarm Listeners (Android Capacitor OS Action Buttons)
    initNativeAlarmListeners();

    if (!('serviceWorker' in navigator)) return;

    // Initialize Global Sync Engine Listeners (online event, visibility change)
    initSyncEngineListeners();

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[ServiceWorker v4] Registered with scope:', registration.scope);

        // Check for updates on every page load
        registration.update().catch(() => {});

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[ServiceWorker v4] New Service Worker version installed and ready.');
              }
            };
          }
        });
      } catch (err) {
        console.error('[ServiceWorker v4] Registration failed:', err);
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
