"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, Send, Terminal, Wifi, Database, Layers, Smartphone, BellOff, BellRing, Trash2 } from "lucide-react";
import Link from "next/link";
import Swal from "sweetalert2";
import { getRemindersFromIDB, getOccurrencesFromIDB, getOfflineQueue } from "@/lib/idb";

export default function DiagnosticsPage() {
  const [platformInfo, setPlatformInfo] = useState<string>("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [swActive, setSwActive] = useState<boolean>(false);
  const [swScope, setSwScope] = useState<string>("");
  const [subscriptionActive, setSubscriptionActive] = useState<boolean>(false);
  const [endpointSnippet, setEndpointSnippet] = useState<string>("");
  const [backendSynced, setBackendSynced] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [cacheActive, setCacheActive] = useState<boolean>(false);
  
  // IDB Stats
  const [idbRemindersCount, setIdbRemindersCount] = useState<number>(0);
  const [idbOccurrencesCount, setIdbOccurrencesCount] = useState<number>(0);
  const [idbQueueCount, setIdbQueueCount] = useState<number>(0);

  const [isTestingPush, setIsTestingPush] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const runDiagnosticCheck = async () => {
    setIsRefreshing(true);
    if (typeof window === 'undefined') return;

    setPlatformInfo(`${navigator.platform} - ${navigator.userAgent.substring(0, 60)}...`);
    setIsOnline(navigator.onLine);

    // 1. Notification Permission Check
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    // 2. Service Worker Check
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        setSwActive(true);
        setSwScope(reg.scope);

        // 3. Web Push Subscription Check
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setSubscriptionActive(true);
          setEndpointSnippet(sub.endpoint.substring(0, 45) + '...');
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

    // 4. Cache Version Check
    if ('caches' in window) {
      try {
        const hasV4 = await caches.has('agendaku-pwa-v4');
        setCacheActive(hasV4);
      } catch (e) {
        setCacheActive(false);
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
        text: 'Untuk menguji di Android, pastikan notifikasi diizinkan pada setelan situs browser.'
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
          Swal.fire({ icon: 'error', title: 'VAPID Key Belum Terpasang', text: 'Variabel NEXT_PUBLIC_VAPID_PUBLIC_KEY tidak ditemukan.' });
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
        setEndpointSnippet(sub.endpoint.substring(0, 45) + '...');

        // Register to backend DB
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
          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Push Subscription Sync Success', showConfirmButton: false, timer: 2000 });
        }
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Registration Push Gagal', text: err.message });
    }
  };

  const handleTestPushAndroid = async () => {
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
        Swal.fire({ icon: 'error', title: 'Push Subscription Kosong', text: 'Gagal mendapatkan token push subscription dari browser.' });
        setIsTestingPush(false);
        return;
      }

      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, delayMs: 3000 })
      });

      const data = await res.json();
      setIsTestingPush(false);

      if (data.success) {
        Swal.fire({
          title: '📲 TEST PUSH TERKIRIM!',
          html: `
            <div class="text-left text-xs space-y-2">
              <p class="text-emerald-400 font-bold">✓ Push request dikirim ke backend server VAPID Push Service.</p>
              <p class="text-zinc-300">Minimize app atau kunci layar Android sekarang. Notifikasi OS akan muncul dalam 3 detik.</p>
              <hr class="border-white/10 my-2"/>
              <p class="text-amber-300"><b>Aksi Notifikasi:</b> CLOSE & SNOOZE 5 MIN (Zero OPEN action)</p>
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'Siap, Memantau Notifikasi'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Server Push Gagal', text: data.error });
      }
    } catch (err: any) {
      setIsTestingPush(false);
      Swal.fire({ icon: 'error', title: 'Test Push Error', text: err.message });
    }
  };

  const handleEmergencyReset = async () => {
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'SW_CLEANUP_TEST_NOTIFICATIONS' });
      }
      await runDiagnosticCheck();
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Test Notifications Cleared', showConfirmButton: false, timer: 1500 });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Cleanup Failed', text: e.message });
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
                <Terminal className="w-6 h-6 text-amber-400" />
                System & Android Push Diagnostics
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 font-medium">Internal Health Checker for Push & Offline Engine</p>
            </div>
          </div>

          <button
            onClick={runDiagnosticCheck}
            disabled={isRefreshing}
            className="p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all text-amber-300 flex items-center gap-2 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Check</span>
          </button>
        </header>

        {/* Hero Test Push Action Card */}
        <div className="glass p-6 rounded-[2rem] border border-emerald-500/30 bg-emerald-500/5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-lg font-black text-emerald-300 flex items-center justify-center sm:justify-start gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              Uji Coba Push Notification Android
            </h2>
            <p className="text-xs text-zinc-400 max-w-lg">
              Kirim Web Push langsung dari server ke Service Worker perangkat Android untuk memverifikasi penerimaan push saat aplikasi ditutup.
            </p>
          </div>

          <button
            onClick={handleTestPushAndroid}
            disabled={isTestingPush}
            className="w-full sm:w-auto px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-black font-black text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
          >
            <Send className={`w-4 h-4 ${isTestingPush ? 'animate-bounce' : ''}`} />
            {isTestingPush ? 'Mengirim Push...' : 'TEST PUSH ANDROID'}
          </button>
        </div>

        {/* Diagnostic Status Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Platform & Device */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-400" /> Platform & Environment
              </span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">INFO</span>
            </div>
            <div className="text-xs font-mono text-zinc-300 bg-black/40 p-3 rounded-xl border border-white/5 break-all">
              {platformInfo || 'Loading...'}
            </div>
          </div>

          {/* Card 2: Connectivity State */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-amber-400" /> Connectivity State
              </span>
              <span className={`text-xs font-bold ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs p-3 bg-black/40 rounded-xl border border-white/5">
              <span className="text-zinc-400">Network Connection:</span>
              <span className={`font-bold ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                {isOnline ? '✓ Internet Connected' : '✕ Offline Mode'}
              </span>
            </div>
          </div>

          {/* Card 3: Notification Permission */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-purple-400" /> Notification Permission
              </span>
              <span className={`text-xs font-bold ${permission === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {permission.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs p-3 bg-black/40 rounded-xl border border-white/5">
              <span className="text-zinc-400">OS / Browser State:</span>
              {permission === 'granted' ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> GRANTED
                </span>
              ) : (
                <button
                  onClick={requestNotificationPermission}
                  className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-lg font-bold hover:bg-amber-500/30 transition-all text-[11px]"
                >
                  Minta Izin
                </button>
              )}
            </div>
          </div>

          {/* Card 4: Service Worker Status */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" /> Service Worker Engine
              </span>
              <span className={`text-xs font-bold ${swActive ? 'text-emerald-400' : 'text-red-400'}`}>
                {swActive ? 'READY' : 'NOT READY'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs p-3 bg-black/40 rounded-xl border border-white/5">
              <span className="text-zinc-400">Registration Scope:</span>
              <span className="font-mono text-[11px] text-zinc-300">{swScope || '/'}</span>
            </div>
          </div>

          {/* Card 5: Push Subscription State */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-4 h-4 text-blue-400" /> Push Subscription State
              </span>
              <span className={`text-xs font-bold ${subscriptionActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                {subscriptionActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 bg-black/40 p-3 rounded-xl border border-white/5 truncate">
              {endpointSnippet || 'No active Web Push endpoint registered'}
            </div>
          </div>

          {/* Card 6: Backend Subscription Sync */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400" /> Backend Database Sync
              </span>
              <span className={`text-xs font-bold ${backendSynced ? 'text-emerald-400' : 'text-amber-400'}`}>
                {backendSynced ? 'SYNCED' : 'NOT SYNCED'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs p-3 bg-black/40 rounded-xl border border-white/5">
              <span className="text-zinc-400">push_subscribers Table:</span>
              <span className={`font-bold ${backendSynced ? 'text-emerald-400' : 'text-amber-400'}`}>
                {backendSynced ? '✓ Subscription In DB' : '✕ Not Registered In DB'}
              </span>
            </div>
          </div>

          {/* Card 7: Offline Shell Cache */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" /> Application Shell Cache
              </span>
              <span className={`text-xs font-bold ${cacheActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                {cacheActive ? 'READY (v4)' : 'BUILDING'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs p-3 bg-black/40 rounded-xl border border-white/5">
              <span className="text-zinc-400">Cache Version:</span>
              <span className="font-mono text-[11px] text-zinc-300">agendaku-pwa-v4</span>
            </div>
          </div>

          {/* Card 8: IndexedDB Local Database */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-purple-400" /> IndexedDB Local Database
              </span>
              <span className="text-xs font-bold text-purple-300">READY (v2)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                <div className="text-[10px] text-zinc-500">Reminders:</div>
                <div className="font-bold text-white text-sm">{idbRemindersCount}</div>
              </div>
              <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                <div className="text-[10px] text-zinc-500">Occurrences:</div>
                <div className="font-bold text-emerald-400 text-sm">{idbOccurrencesCount}</div>
              </div>
              <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                <div className="text-[10px] text-zinc-500">Queue:</div>
                <div className="font-bold text-amber-400 text-sm">{idbQueueCount}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Emergency Tool */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleEmergencyReset}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Reset Active Test Notifications
          </button>
        </div>
      </div>
    </main>
  );
}
