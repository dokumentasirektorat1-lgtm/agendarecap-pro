"use client";

import { useAuth } from "@/components/ClientAuthGuard";
import { useState, useEffect } from "react";
import { Wifi, WifiOff, UserCheck, RefreshCw, CheckCircle2, AlertTriangle, Database, ShieldAlert } from "lucide-react";
import { runSyncEngine } from "@/lib/sync-engine";
import DiagnosticModal from "@/components/DiagnosticModal";
import { isNativePlatform } from "@/lib/native-alarm";

export default function ConnectivityBanner() {
  const { user, isOnline, pendingQueueCount, failedQueueCount, refreshAuth } = useAuth();
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [isSupabaseReachable, setIsSupabaseReachable] = useState<boolean | null>(null);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [diagnosticFilter, setDiagnosticFilter] = useState<'ALL' | 'PENDING' | 'FAILED'>('ALL');

  const checkSupabaseReachability = async () => {
    if (!isOnline) {
      setIsSupabaseReachable(false);
      return;
    }
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.from('agendas').select('id', { head: true, count: 'exact' }).limit(1);
      setIsSupabaseReachable(!error);
    } catch {
      setIsSupabaseReachable(false);
    }
  };

  const handleManualTriggerSync = async () => {
    if (!isOnline) return;
    setSyncState('syncing');
    setSyncErrorMsg(null);
    try {
      const res = await runSyncEngine();
      if (res.success) {
        setSyncState('success');
        setIsSupabaseReachable(true);
        setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));
        if (refreshAuth) refreshAuth();
      } else {
        setSyncState('error');
        setSyncErrorMsg(res.errors[0] || 'Sync failed');
      }
    } catch (e: any) {
      setSyncState('error');
      setSyncErrorMsg(e.message);
    }
  };

  useEffect(() => {
    checkSupabaseReachability();
    if (isOnline) {
      setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));
    }
  }, [isOnline]);

  const openDiagnosticWithFilter = (filter: 'ALL' | 'PENDING' | 'FAILED') => {
    setDiagnosticFilter(filter);
    setIsDiagnosticOpen(true);
  };

  const shortUserId = user?.id ? `${user.id.substring(0, 6)}...` : null;

  const isNative = isNativePlatform();

  return (
    <>
      {isNative ? (
        /* Native Compact Mode (Section 29) */
        <div className="w-full bg-[#121215]/90 backdrop-blur-md border-b border-white/10 px-3 py-1.5 flex items-center justify-between text-[11px] shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-bold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {isOnline ? "Online" : "Offline"}
            </span>

            <span className="text-zinc-500">|</span>

            <button
              onClick={() => openDiagnosticWithFilter(failedQueueCount > 0 ? 'FAILED' : pendingQueueCount > 0 ? 'PENDING' : 'ALL')}
              className="flex items-center gap-1.5 text-zinc-300 font-semibold hover:text-white transition-colors"
            >
              <span>Pending: <strong className={pendingQueueCount > 0 ? "text-amber-400 font-bold" : "text-zinc-400"}>{pendingQueueCount}</strong></span>
              <span>Gagal: <strong className={failedQueueCount > 0 ? "text-red-400 font-bold" : "text-zinc-400"}>{failedQueueCount}</strong></span>
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
            </button>
          </div>

          <button
            onClick={handleManualTriggerSync}
            disabled={syncState === 'syncing' || !isOnline}
            className="flex items-center gap-1 px-2.5 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full font-semibold text-[10px] active:scale-95"
          >
            {syncState === 'syncing' ? <RefreshCw className="w-3 h-3 animate-spin text-amber-400" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
            <span>{syncState === 'syncing' ? 'Sync...' : 'Sync'}</span>
          </button>
        </div>
      ) : (
        /* Web Standard Banner */
        <div className="w-full bg-[#121215]/80 backdrop-blur-md border-b border-white/5 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-3 shadow-inner">
          {/* 1. Network & Supabase Status */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bold text-emerald-400">Network: Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  <span className="font-bold text-red-400">Network: Offline</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              {isSupabaseReachable === true ? (
                <span className="font-bold text-emerald-400">Supabase: Connected</span>
              ) : isSupabaseReachable === false && isOnline ? (
                <span className="font-bold text-amber-400">Supabase: Unreachable</span>
              ) : (
                <span className="font-bold text-zinc-500">Supabase: Offline</span>
              )}
            </div>

            {/* 2. Auth Status */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              <UserCheck className="w-3.5 h-3.5 text-purple-400" />
              {user ? (
                <span className="font-medium text-zinc-300">
                  Auth: <span className="font-mono text-purple-300 font-bold">{shortUserId}</span>
                </span>
              ) : (
                <span className="font-bold text-amber-400">Auth: Belum Login</span>
              )}
            </div>
          </div>

          {/* 3. Sync Status & Interactive Diagnostic Controls */}
          <div className="flex items-center gap-2">
            {pendingQueueCount > 0 && (
              <button
                onClick={() => openDiagnosticWithFilter('PENDING')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[10px] border border-amber-500/40 transition-all active:scale-95 cursor-pointer shadow-sm"
                title="Klik untuk melihat rincian antrean Pending"
              >
                <Database className="w-3 h-3 text-amber-400" />
                <span>Pending: {pendingQueueCount}</span>
              </button>
            )}

            {failedQueueCount > 0 && (
              <button
                onClick={() => openDiagnosticWithFilter('FAILED')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-[10px] border border-red-500/40 transition-all active:scale-95 cursor-pointer shadow-sm"
                title="Klik untuk melihat rincian error Gagal"
              >
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span>Gagal: {failedQueueCount}</span>
              </button>
            )}

            <button
              onClick={() => openDiagnosticWithFilter('ALL')}
              className="p-1 text-zinc-400 hover:text-purple-300 hover:bg-white/10 rounded-full transition-colors"
              title="Buka Diagnostik Sistem Lengkap"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>

            <button
              onClick={handleManualTriggerSync}
              disabled={syncState === 'syncing' || !isOnline}
              className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-full text-purple-300 hover:text-purple-200 font-semibold transition-all active:scale-95 disabled:opacity-50"
              title={syncErrorMsg || "Jalankan Sinkronisasi Supabase"}
            >
              {syncState === 'syncing' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span className="text-amber-400">Syncing...</span>
                </>
              ) : syncState === 'error' ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-red-400">{syncErrorMsg ? (syncErrorMsg.length > 25 ? `${syncErrorMsg.substring(0, 25)}...` : syncErrorMsg) : 'Sync Gagal'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{lastSyncTime ? `Synced (${lastSyncTime})` : 'Sync Ready'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <DiagnosticModal
        isOpen={isDiagnosticOpen}
        onClose={() => setIsDiagnosticOpen(false)}
        initialFilter={diagnosticFilter}
        onQueueUpdated={() => {
          if (refreshAuth) refreshAuth();
        }}
      />
    </>
  );
}
