// Offline Sync Engine for Agendaku PWA & Native Android
// Reconciles local IndexedDB offline queue with Supabase server via Direct Client SDK & Union Merge Strategy
// Also reconciles Android Native AlarmManager state with active occurrences

import { syncRepository } from '@/lib/repositories/sync-repository';
import { createClient } from '@/lib/supabase/client';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

let isListenersInitialized = false;

export async function runSyncEngine(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  return await syncRepository.runSync();
}

export function initSyncEngineListeners() {
  if (typeof window === 'undefined' || isListenersInitialized) return;
  isListenersInitialized = true;

  console.log('[SYNC ENGINE] Initializing global listeners (Auth, Online, Visibility, App State)');
  const supabase = createClient();

  // 1. Supabase Auth State Change Listener
  supabase.auth.onAuthStateChange(async (event: string, session: any) => {
    console.log(`[AUTH] Auth state changed: ${event} | user_id=${session?.user?.id || 'none'}`);

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session?.user?.id && navigator.onLine) {
        runSyncEngine().catch((err) => console.warn('[SYNC ENGINE] Auth-triggered sync notice:', err));
      }
    }
  });

  // 2. Network Online Listener
  const handleOnline = () => {
    console.log('[SYNC] Connection restored -> Triggering Sync Engine');
    runSyncEngine().catch((err) => console.warn('[SYNC ENGINE] Online sync notice:', err));
  };

  // 3. Document Visibility Listener (Tab Focus)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      runSyncEngine().catch((err) => console.warn('[SYNC ENGINE] Visibility sync notice:', err));
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 4. Capacitor Android Native App Resume Listener
  if (Capacitor.isNativePlatform()) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && navigator.onLine) {
        console.log('[SYNC ENGINE] Capacitor App resumed (isActive=true) -> Triggering Sync Engine');
        runSyncEngine().catch((err) => console.warn('[SYNC ENGINE] App resume sync notice:', err));
      }
    }).catch((err) => {
      console.warn('[CAPACITOR APP LISTENER] Error adding appStateChange listener:', err);
    });
  }

  // 5. Immediate Startup Sync
  if (navigator.onLine) {
    runSyncEngine().catch((err) => console.warn('[SYNC ENGINE] Initial startup sync notice:', err));
  }
}
