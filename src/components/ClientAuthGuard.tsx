"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { CalendarHeart, RefreshCw } from "lucide-react";

export type AuthContextType = {
  session: Session | null;
  user: User | null;
  authLoading: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncAt: string | null;
  lastSyncError: string | null;
  pendingQueueCount: number;
  failedQueueCount: number;
  lastAuthEvent: string;
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  authLoading: true,
  isOnline: true,
  syncStatus: 'idle',
  lastSyncAt: null,
  lastSyncError: null,
  pendingQueueCount: 0,
  failedQueueCount: 0,
  lastAuthEvent: 'NONE',
  refreshAuth: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const PUBLIC_ROUTES = ['/login', '/waiting-approval'];

export default function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [failedQueueCount, setFailedQueueCount] = useState(0);
  const [lastAuthEvent, setLastAuthEvent] = useState('INITIALIZING');

  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname || '');

  const checkAuthAndSyncQueue = async () => {
    if (typeof window === 'undefined') return;

    try {
      console.log('[AUTH] initialization started');
      const supabase = createClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (currentSession) {
        console.log('[AUTH] session found');
        console.log('[AUTH] user found');
        console.log(`[AUTH] user id: ${currentSession.user.id}`);
      } else {
        console.log('[AUTH] session missing');
        console.log('[AUTH] user missing');
      }

      setSession(currentSession);
      setUser(currentSession?.user || null);

      // Check IDB queue
      const { getOfflineQueueDebugInfo } = await import("@/lib/idb");
      const qInfo = await getOfflineQueueDebugInfo();
      setPendingQueueCount(qInfo.pending);
      setFailedQueueCount(qInfo.failedRetryable + qInfo.failedFatal);
    } catch (e: any) {
      console.warn('[AUTH] Check session notice:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);
    checkAuthAndSyncQueue();

    const supabase = createClient();

    // Subscribe to Auth State Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      console.log(`[AUTH] Auth Event: ${event}`);
      setLastAuthEvent(event);
      setSession(newSession);
      setUser(newSession?.user || null);
      setAuthLoading(false);

      if (event === 'SIGNED_OUT') {
        console.log('[AUTH] signed out');
        const { useStore } = await import("@/store/useStore");
        useStore.setState({ agendas: [], sharedDates: {} });
        if (!PUBLIC_ROUTES.includes(window.location.pathname)) {
          router.replace('/login');
        }
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (event === 'SIGNED_IN') console.log('[AUTH] signed in');
        if (newSession) {
          console.log(`[AUTH] user id: ${newSession.user.id}`);
          if (window.location.pathname === '/login') {
            router.replace('/');
          }
        }
      }
    });

    // Network Online / Offline Listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [router]);

  // Route protection redirect effect
  useEffect(() => {
    if (authLoading) return;

    if (!session && !isPublicRoute) {
      console.log(`[AUTH GUARD] Unauthenticated access to protected route "${pathname}" -> Redirecting to /login`);
      router.replace('/login');
    } else if (session && pathname === '/login') {
      console.log(`[AUTH GUARD] Authenticated session active -> Redirecting from /login to /`);
      router.replace('/');
    }
  }, [session, authLoading, isPublicRoute, pathname, router]);

  // Render Full Screen Loading state while verifying auth session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/20 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="glass p-8 rounded-[2rem] border border-white/10 flex flex-col items-center gap-4 text-center z-10 max-w-sm shadow-2xl">
          <div className="p-3 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-2xl shadow-lg shadow-purple-500/20 animate-pulse">
            <CalendarHeart className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">AgendaRecap Pro</h2>
            <p className="text-xs text-zinc-400 font-medium">Memverifikasi Sesi Otentikasi...</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-purple-400 font-semibold bg-purple-500/10 px-4 py-2 rounded-xl border border-purple-500/20">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Memuat data lokal...</span>
          </div>
        </div>
      </div>
    );
  }

  // If unauthenticated and on protected route, return loading screen until router.replace finishes
  if (!session && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-4">
        <div className="glass p-6 rounded-[2rem] border border-white/10 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-zinc-400 font-medium">Mengarahkan ke Halaman Login...</p>
        </div>
      </div>
    );
  }

  const contextValue: AuthContextType = {
    session,
    user,
    authLoading,
    isOnline,
    syncStatus,
    lastSyncAt,
    lastSyncError,
    pendingQueueCount,
    failedQueueCount,
    lastAuthEvent,
    refreshAuth: checkAuthAndSyncQueue
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
