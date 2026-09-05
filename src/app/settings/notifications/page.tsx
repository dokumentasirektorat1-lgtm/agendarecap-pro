"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, ShieldAlert, CheckCircle2, RefreshCw, Send, Terminal, Wifi, Database, Layers, Smartphone, Trash2, Bell, Calendar, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";
import Swal from "sweetalert2";
import { getRemindersFromIDB, getOccurrencesFromIDB, getOfflineQueue } from "@/lib/idb";
import { runSyncEngine } from "@/lib/sync-engine";
import { isNativePlatform, requestNativeAlarmPermissions, scheduleNativeLocalAlarm, cancelAllNativeLocalAlarms } from "@/lib/native-alarm";

export default function NotificationSettingsPage() {
  const [platformInfo, setPlatformInfo] = useState<string>("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [nativeAlarmStatus, setNativeAlarmStatus] = useState<string>("INACTIVE");
  const [swActive, setSwActive] = useState<boolean>(false);
  const [swScope, setSwScope] = useState<string>("");
  const [subscriptionActive, setSubscriptionActive] = useState<boolean>(false);
  const [endpointSnippet, setEndpointSnippet] = useState<string>("");
  const [backendSynced, setBackendSynced] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [cacheVersion, setCacheVersion] = useState<string>("agendaku-pwa-v5");
  const [lastSyncTime, setLastSyncTime] = useState<string>("Belum ada");

  // IDB Stats
  const [idbRemindersCount, setIdbRemindersCount] = useState<number>(0);
  const [idbOccurrencesCount, setIdbOccurrencesCount] = useState<number>(0);
  const [idbQueueCount, setIdbQueueCount] = useState<number>(0);

  const [isTestingPush, setIsTestingPush] = useState<boolean>(false);
  const [isTestingLocal, setIsTestingLocal] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const runDiagnosticCheck = async () => {
    setIsRefreshing(true);
    if (typeof window === 'undefined') return;

    setPlatformInfo(`${navigator.platform} - ${navigator.userAgent.substring(0, 50)}...`);
    setIsOnline(navigator.onLine);

    // 1. Notification Permission Check
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    // 2. Native Alarm Check
    if (isNativePlatform()) {
      const nativePerm = await requestNativeAlarmPermissions();
      setNativeAlarmStatus(nativePerm.notifications === 'granted' ? 'ACTIVE' : 'PERMISSION DENIED');
    } else {
      setNativeAlarmStatus('INACTIVE (Web Mode)');
    }

    // 3. Service Worker & Push Check
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        setSwActive(true);
        setSwScope(reg.scope);

        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setSubscriptionActive(true);
          setEndpointSnippet(sub.endpoint.substring(0, 40) + '...');
          setBackendSynced(true);
        } else {
          setSubscriptionActive(false);
          setEndpointSnippet("");
          setBackendSynced(false);
        }
      } catch (err) {
        setSwActive(false);
        setSubscriptionActive(false);
      }
    }

    // 4. Cache Check
    if ('caches' in window) {
      try {
        const hasV5 = await caches.has('agendaku-pwa-v5');
        if (hasV5) setCacheVersion('agendaku-pwa-v5 (ACTIVE)');
      } catch (e) {
        console.warn('Cache check notice:', e);
      }
    }

    // 5. IndexedDB Stats
    try {
      const rems = await getRemindersFromIDB();
      const occs = await getOccurrencesFromIDB();
      const queue = await getOfflineQueue();
      setIdbRemindersCount(rems.length);
      setIdbOccurrencesCount(occs.length);
      setIdbQueueCount(queue.length);
    } catch (e) {
      console.warn('IDB diagnostic read notice:', e);
    }

    const savedLastSync = localStorage.getItem('last_sync_timestamp');
    if (savedLastSync) {
      setLastSyncTime(new Date(parseInt(savedLastSync)).toLocaleString('id-ID'));
    }

    setIsRefreshing(false);
  };

  useEffect(() => {
    runDiagnosticCheck();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      Swal.fire({ icon: 'error', title: 'Tidak Didukung', text: 'Browser tidak mendukung Notifikasi Desktop/PWA.' });
      return;
    }

    const res = await Notification.requestPermission();
    setPermission(res);

    if (res === 'granted') {
      await registerPushSubscription();
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Izin Notifikasi Ditolak',
        text: 'Agendarecap membutuhkan izin notifikasi agar pengingat dan alarm dapat muncul tepat waktu.'
      });
    }
  };

  const registerPushSubscription = async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!VAPID_KEY) {
          Swal.fire({ icon: 'error', title: 'VAPID Key Missing', text: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY tidak ditemukan.' });
          return;
        }

        const urlBase64ToUint8Array = (base64String: string) => {
          const padding = '='.repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
          return outputArray;
        };

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
        });
      }

      if (sub) {
        setSubscriptionActive(true);
        setEndpointSnippet(sub.endpoint.substring(0, 40) + '...');

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub,
            deviceInfo: {
              userAgent: navigator.userAgent,
              platform: navigator.platform
            }
          })
        });

        if (res.ok) {
          setBackendSynced(true);
          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Push Subscription Synced', showConfirmButton: false, timer: 2000 });
        }
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Registration Push Gagal', text: err.message });
    }
  };

  const handleTestLocalAlarm = async () => {
    setIsTestingLocal(true);
    const targetTime = new Date(Date.now() + 5000).toISOString();

    if (isNativePlatform()) {
      const ok = await scheduleNativeLocalAlarm({
        reminderId: 'test-local-reminder',
        occurrenceId: `test-occ-${Date.now()}`,
        title: '⏰ TEST NATIVE ALARM LOKAL',
        body: 'Dokumen evaluasi dan laptop sudah disiapkan.',
        scheduledAt: targetTime
      });

      setIsTestingLocal(false);
      if (ok) {
        Swal.fire({
          icon: 'success',
          title: 'Native Alarm Dijadwalkan (+5 detik)',
          text: 'Kunci atau matikan internet perangkat Anda. Alarm lokal native OS Android akan berbunyi dalam 5 detik.'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal Menjadwalkan Alarm Native' });
      }
    } else {
      // PWA Browser Fallback Test
      setTimeout(() => {
        setIsTestingLocal(false);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏰ TEST LOCAL ALARM (PWA Fallback)', {
            body: 'Jangan lupa membawa dokumen evaluasi dan laptop.',
            icon: '/icon.svg',
            tag: `test-local-${Date.now()}`
          });
        } else {
          Swal.fire({ title: '⏰ TEST ALARM LOKAL', text: 'Jangan lupa membawa dokumen evaluasi dan laptop.', icon: 'info' });
        }
      }, 3000);

      Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Test alarm akan muncul dalam 3 detik', showConfirmButton: false, timer: 3000 });
    }
  };

  const handleTestPush = async () => {
    if (permission !== 'granted') {
      await requestNotificationPermission();
      return;
    }

    setIsTestingPush(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        await registerPushSubscription();
        subscription = await reg.pushManager.getSubscription();
      }

      if (!subscription) {
        Swal.fire({ icon: 'error', title: 'Push Subscription Kosong' });
        setIsTestingPush(false);
        return;
      }

      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, delayMs: 2000 })
      });

      const data = await res.json();
      setIsTestingPush(false);

      if (data.success) {
        Swal.fire({ icon: 'success', title: 'Test Web Push Terkirim!', text: 'Notifikasi akan muncul dalam 2 detik.' });
      } else {
        Swal.fire({ icon: 'error', title: 'Server Push Gagal', text: data.error });
      }
    } catch (err: any) {
      setIsTestingPush(false);
      Swal.fire({ icon: 'error', title: 'Test Push Error', text: err.message });
    }
  };

  const handleTestSync = async () => {
    setIsRefreshing(true);
    const res = await runSyncEngine();
    localStorage.setItem('last_sync_timestamp', Date.now().toString());
    await runDiagnosticCheck();
    Swal.fire({
      icon: res.success ? 'success' : 'warning',
      title: 'Hasil Sync Engine',
      text: `Status: ${res.success ? 'Berhasil' : 'Dengan Catatan'} | Total Item Tersinkron: ${res.syncedCount}`
    });
  };

  const handleClearStaleCache = async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      let deleted = 0;
      for (const k of keys) {
        if (k !== 'agendaku-pwa-v5') {
          await caches.delete(k);
          deleted++;
        }
      }
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Dihapus ${deleted} cache usang`, showConfirmButton: false, timer: 1500 });
      await runDiagnosticCheck();
    }
  };

  const handleCancelAllAlarms = async () => {
    if (isNativePlatform()) {
      await cancelAllNativeLocalAlarms();
      Swal.fire({ icon: 'success', title: 'Seluruh Alarm Native Dibatalkan' });
    } else {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'SW_CLEANUP_TEST_NOTIFICATIONS' });
      }
      Swal.fire({ icon: 'success', title: 'Seluruh Notifikasi Di-reset' });
    }
  };

  return (
    <main className="min-h-screen relative bg-[#0A0A0B] text-zinc-100 p-4 sm:p-8 pb-20">
      {/* Background Glow */}
      <div className="fixed top-[-10%] left-[-10%] w-[45%] h-[45%] bg-amber-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto flex flex-col gap-6">
        
        {/* Header */}
        <header className="flex items-center justify-between glass p-4 sm:p-6 rounded-[2rem] border border-amber-500/20 shadow-2xl">
          <div className="flex items-center gap-4">
            <Link 
              href="/reminders"
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-zinc-400 hover:text-white border border-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <Bell className="w-6 h-6 text-amber-400" />
                Notification & Alarm Status
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 font-medium">Pengaturan & Panel Diagnostik Alarm AgendaRecap Pro</p>
            </div>
          </div>

          <button
            onClick={runDiagnosticCheck}
            disabled={isRefreshing}
            className="p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all text-amber-300 flex items-center gap-2 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Status</span>
          </button>
        </header>

        {/* Permission UX Banner */}
        {permission !== 'granted' && (
          <div className="glass p-5 rounded-[1.8rem] border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-amber-300 text-sm">Izin Notifikasi Diperlukan</h3>
                <p className="text-xs text-zinc-300">
                  AgendaRecap membutuhkan izin notifikasi agar pengingat dan alarm dapat muncul tepat waktu.
                </p>
              </div>
            </div>
            <button
              onClick={requestNotificationPermission}
              className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-bold text-xs rounded-xl shadow-lg transition-all shrink-0"
            >
              Minta Izin Notifikasi
            </button>
          </div>
        )}

        {/* Diagnostic Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Item 1: Notification Permission */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-purple-400" /> Notification Permission
              </span>
              <span className={`text-xs font-black ${permission === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {permission.toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-zinc-300 flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/5">
              <span>Status Izin Web / OS:</span>
              <span className="font-bold text-white">{permission}</span>
            </div>
          </div>

          {/* Item 2: Native Alarm Status */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-400" /> Android Local Alarm Engine
              </span>
              <span className={`text-xs font-black ${nativeAlarmStatus === 'ACTIVE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {nativeAlarmStatus}
              </span>
            </div>
            <div className="text-xs text-zinc-300 flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/5">
              <span>Platform Mode:</span>
              <span className="font-bold text-white">{isNativePlatform() ? 'Capacitor Native Android' : 'Web / PWA Fallback'}</span>
            </div>
          </div>

          {/* Item 3: Push Subscription */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-4 h-4 text-emerald-400" /> Push Subscription State
              </span>
              <span className={`text-xs font-black ${subscriptionActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                {subscriptionActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 bg-black/40 p-3 rounded-xl border border-white/5 truncate">
              {endpointSnippet || 'Belum ada push token'}
            </div>
          </div>

          {/* Item 4: Sync & Network */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-amber-400" /> Synchronization State
              </span>
              <span className={`text-xs font-black ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="text-xs text-zinc-300 flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/5">
              <span>Terakhir Sinkronisasi:</span>
              <span className="font-bold text-emerald-400">{lastSyncTime}</span>
            </div>
          </div>
        </div>

        {/* Diagnostic Actions Panel */}
        <div className="glass p-6 rounded-[2rem] border border-white/10 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-400" /> Panel Pengujian & Utilitas Alarm
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={handleTestLocalAlarm}
              disabled={isTestingLocal}
              className="p-3.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center gap-1.5"
            >
              <Clock className="w-5 h-5 text-blue-400" />
              <span>TEST LOCAL ALARM</span>
            </button>

            <button
              onClick={handleTestPush}
              disabled={isTestingPush}
              className="p-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center gap-1.5"
            >
              <Send className="w-5 h-5 text-emerald-400" />
              <span>TEST PUSH</span>
            </button>

            <button
              onClick={handleTestSync}
              className="p-3.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-5 h-5 text-purple-400" />
              <span>TEST SYNC</span>
            </button>

            <button
              onClick={handleClearStaleCache}
              className="p-3.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center gap-1.5"
            >
              <Layers className="w-5 h-5 text-amber-400" />
              <span>CLEAR CACHE</span>
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleCancelAllAlarms}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> CANCEL ALL LOCAL ALARMS
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
