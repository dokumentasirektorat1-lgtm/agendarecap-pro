"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[ServiceWorker] Registered with scope:', registration.scope);

        // Check for updates on load
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[ServiceWorker] New version available, updating cache...');
                // Optionally postMessage skipWaiting if needed
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            };
          }
        });

        // Register Background Sync if supported
        if ('sync' in registration) {
          try {
            await (registration as any).sync.register('sync-reminders');
          } catch (syncErr) {
            console.warn('[ServiceWorker] Background Sync registration warning:', syncErr);
          }
        }
      } catch (err) {
        console.error('[ServiceWorker] Registration failed:', err);
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
