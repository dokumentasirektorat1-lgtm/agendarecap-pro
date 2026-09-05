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

    // 4. Service Worker Registration (Web Push & Offline Fallback)
    if (!('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const swUrl = new URL('/sw.js', window.location.origin).href;
        const registration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
        console.log('[ServiceWorker v5] Registered with scope:', registration.scope);

        // Check for updates on every page load
        registration.update().catch(() => {});

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[ServiceWorker v5] New Service Worker version installed and ready.');
              }
            };
          }
        });
      } catch (err) {
        console.error('[ServiceWorker v5] Registration failed:', err);
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
