import { createBrowserClient } from '@supabase/ssr';
import { createClient as createClientJS } from '@supabase/supabase-js';

let cachedSupabaseClient: any = null;

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  return (
    win.Capacitor?.isNativePlatform?.() === true ||
    win.Capacitor?.getPlatform?.() === 'android' ||
    win.Capacitor?.getPlatform?.() === 'ios' ||
    win.isAndroidNativeBridge === true
  );
}

export function createClient() {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qizsddkgzwixwrkbvalr.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key-for-dummy-account';

  if (isCapacitorNative()) {
    console.log('[AUTH] Initializing Supabase Client (Capacitor Native Engine -> localStorage)');
    cachedSupabaseClient = createClientJS(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  } else {
    console.log('[AUTH] Initializing Supabase Client (Web/PWA SSR Engine)');
    cachedSupabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return cachedSupabaseClient;
}
