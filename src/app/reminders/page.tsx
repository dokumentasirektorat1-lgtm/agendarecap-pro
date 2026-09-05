"use client";

import { useState, useEffect } from "react";
import { useReminderStore, Reminder, Frequency, ReminderStatus } from "@/store/useReminderStore";
import { getUTCISOFromLocal, formatLocalFromUTC } from "@/lib/timezone";
import { Bell, BellRing, Plus, Trash2, ArrowLeft, Clock, Calendar, ShieldAlert, Edit2, RefreshCw, Zap, CheckCircle2, AlertTriangle, Monitor, Send, Globe, Check, X, BellOff, Info, Terminal, Activity } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Swal from "sweetalert2";

export default function RemindersPage() {
  const { reminders, dbSynced, fetchReminders, addReminder, toggleReminder, deleteReminder, updateReminder, snoozeReminder, updateReminderStatus } = useReminderStore();
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [time, setTime] = useState("08:00");
  const [scheduledDate, setScheduledDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [timezone, setTimezone] = useState<string>("Asia/Jakarta");
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [sound, setSound] = useState<string>("default");
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active');

  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [swActive, setSwActive] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Debug Panel States (Hidden by default for production)
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState<{ local: string; utc: string }>({ local: '', utc: '' });
  const [lastCronResult, setLastCronResult] = useState<any>(null);

  useEffect(() => {
    fetchReminders();
    if (typeof window !== 'undefined') {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta");
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          setSwActive(true);
          reg.pushManager.getSubscription().then((sub) => {
            setSubscriptionActive(!!sub);
          });
        }).catch(() => setSwActive(false));
      }
    }
  }, [fetchReminders]);

  // Real-time clock tick for Debug Panel
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime({
        local: new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(now),
        utc: now.toISOString()
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync push subscription to backend API
  const syncPushSubscription = async (forceReRegister = false) => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (forceReRegister && subscription) {
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!VAPID_KEY) {
          console.warn("[REMINDER] VAPID Public key missing in environment variables");
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

        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
        });
      }

      if (subscription) {
        setSubscriptionActive(true);
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription,
            deviceInfo: {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              language: navigator.language
            },
            reminders
          })
        });
        console.log('[REMINDER] Web Push Subscription synced to database push_subscribers table');
      }
    } catch (err: any) {
      console.error("[REMINDER] Failed to sync push subscription:", err);
    }
  };

  useEffect(() => {
    if (permission === 'granted') {
      syncPushSubscription();
    }
  }, [permission, reminders]);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      Swal.fire({ icon: 'error', title: 'Tidak Didukung', text: 'Browser tidak mendukung Notifikasi Desktop/PWA.' });
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      await syncPushSubscription(true);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Notifikasi Web Push Diaktifkan!', showConfirmButton: false, timer: 2000 });
    } else if (result === 'denied') {
      Swal.fire({
        icon: 'warning',
        title: 'Izin Ditolak',
        html: '<p class="text-sm">Anda menolak izin notifikasi. Untuk mengaktifkan kembali:</p><ol class="text-xs text-left mt-2 pl-4 list-disc"><li>Klik ikon gembok/setelan di sebelah URL browser.</li><li>Ubah izin Notifikasi menjadi <b>Izinkan (Allow)</b>.</li><li>Muat ulang halaman ini.</li></ol>'
      });
    }
  };

  const unsubscribePush = async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint })
        });
        setSubscriptionActive(false);
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Web Push Dinonaktifkan', showConfirmButton: false, timer: 1500 });
      }
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Gagal Unsubscribe', text: e.message });
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    await fetchReminders();
    if (permission === 'granted') {
      await syncPushSubscription();
    }
    
    // Also hit cron endpoint to check scheduler
    try {
      const res = await fetch('/api/push/cron', { method: 'POST' });
      const data = await res.json();
      setLastCronResult(data);
    } catch (e) {
      console.error(e);
    }

    setIsSyncing(false);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Data & Scheduler Tersinkronisasi',
      showConfirmButton: false,
      timer: 1500
    });
  };

  // TAHAP 10: TEST SCHEDULED REMINDER 30 DETIK
  const testScheduledReminder30s = async () => {
    if (permission !== 'granted') {
      await requestPermission();
    }

    const now = new Date();
    const scheduledTime = new Date(now.getTime() + 30000); // 30 seconds from now
    const scheduledISO = scheduledTime.toISOString();

    const hh = scheduledTime.getHours().toString().padStart(2, '0');
    const mm = scheduledTime.getMinutes().toString().padStart(2, '0');
    const ss = scheduledTime.getSeconds().toString().padStart(2, '0');

    const titleText = `⏱ Uji Scheduled Reminder (30s)`;
    const bodyText = `Notifikasi scheduled reminder otomatis (Target: ${hh}:${mm}:${ss} WIB).`;

    console.log(`[REMINDER] Triggering 30s test reminder... Now=${now.toISOString()} ScheduledTarget=${scheduledISO}`);

    await addReminder({
      title: titleText,
      body: bodyText,
      time: `${hh}:${mm}`,
      scheduledAt: scheduledISO,
      timezone: timezone || 'Asia/Jakarta',
      frequency: 'once',
      sound: 'default'
    });

    Swal.fire({
      title: 'Scheduled Reminder Dijadwalkan!',
      html: `
        <div class="text-left text-xs space-y-2">
          <p class="text-emerald-400 font-bold">✓ Saved to Database & IndexedDB</p>
          <p><b>Target Waktu:</b> ${hh}:${mm}:${ss} WIB (30 detik lagi)</p>
          <p><b>Target UTC:</b> ${scheduledISO}</p>
          <hr class="border-white/10 my-2"/>
          <p class="text-amber-300 font-semibold">⚡ Cara Uji Coba Scheduler:</p>
          <ol class="list-decimal pl-4 space-y-1 text-zinc-300">
            <li>Pastikan command <b>npm run scheduler:dev</b> sedang berjalan di terminal lokal Anda.</li>
            <li>Scheduler akan memproses reminder ini saat target UTC tercapai.</li>
            <li>Notifikasi OS akan muncul otomatis melalui Web Push & Service Worker!</li>
          </ol>
        </div>
      `,
      icon: 'success',
      confirmButtonText: 'Siap, Memantau Scheduler'
    });
  };

  const testForegroundNotification = async () => {
    if (permission !== 'granted') {
      await requestPermission();
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification("Pengingat Uji Coba PC / PWA (Sticky)", {
        body: "Ini adalah notifikasi uji coba langsung dengan aksi Snooze dan Close.",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "test-foreground-sticky",
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        actions: [
          { action: 'close', title: '❌ CLOSE' },
          { action: 'snooze_5', title: '⏱ 5 MIN' },
          { action: 'snooze_15', title: '⏱ 15 MIN' },
          { action: 'snooze_60', title: '⏱ 1 HOUR' }
        ]
      } as any);
    }
  };

  const testServerCloudPush = async () => {
    if (permission !== 'granted') {
      await requestPermission();
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!VAPID_KEY) {
          Swal.fire({ icon: 'error', title: 'VAPID Key Belum Diatur', text: 'Variabel NEXT_PUBLIC_VAPID_PUBLIC_KEY belum dikonfigurasi.' });
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
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
        });
      }

      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, delayMs: 4000 })
      });

      const data = await res.json();
      if (data.success) {
        Swal.fire({
          title: 'Tutup Tab / Minimize App Sekarang!',
          text: 'Server akan mengirimkan Web Push melalui VAPID Push Service dalam 4 detik.',
          icon: 'success',
          confirmButtonText: 'Siap'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal Kirim Push', text: data.error });
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error Cloud Push', text: err.message });
    }
  };

  const handleEmergencyCleanup = async () => {
    try {
      const res = await fetch('/api/dev/reminders/cleanup', { method: 'POST' });
      const data = await res.json();
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'SW_CLEANUP_TEST_NOTIFICATIONS' });
      }
      await fetchReminders();
      Swal.fire({
        icon: 'success',
        title: 'Emergency Cleanup Berhasil!',
        text: 'Seluruh test reminder lama telah dibatalkan & notifikasi aktif dibersihkan.',
        confirmButtonText: 'OK'
      });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Gagal Cleanup', text: err.message });
    }
  };

  const handleAddOrUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    // Use precise timezone conversion helper to get ISO UTC
    const scheduledAtISO = getUTCISOFromLocal(scheduledDate, time, timezone);

    if (editingId) {
      updateReminder(editingId, {
        title,
        body: bodyText,
        time,
        scheduledAt: scheduledAtISO,
        timezone,
        frequency,
        sound,
        daysOfWeek: frequency === 'weekly' ? [new Date(scheduledDate).getDay()] : undefined
      });
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pengingat Diperbarui', showConfirmButton: false, timer: 1500 });
    } else {
      addReminder({
        title,
        body: bodyText,
        time,
        scheduledAt: scheduledAtISO,
        timezone,
        frequency,
        sound,
        daysOfWeek: frequency === 'weekly' ? [new Date(scheduledDate).getDay()] : undefined
      });
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pengingat Dijadwalkan', showConfirmButton: false, timer: 1500 });
    }

    resetForm();
  };

  const resetForm = () => {
    setTitle("");
    setBodyText("");
    setTime("08:00");
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setFrequency("once");
    setSound("default");
    setEditingId(null);
    setIsAdding(false);
  };

  const handleEdit = (reminder: Reminder) => {
    setTitle(reminder.title);
    setBodyText(reminder.body || "");
    setTime(reminder.time || "08:00");
    if (reminder.scheduledAt) {
      setScheduledDate(new Date(reminder.scheduledAt).toISOString().split('T')[0]);
    }
    setTimezone(reminder.timezone || "Asia/Jakarta");
    setFrequency(reminder.frequency || "once");
    setSound(reminder.sound || "default");
    setEditingId(reminder.id);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredReminders = reminders.filter(r => {
    if (activeTab === 'active') {
      return r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'processing' || (r.isActive && r.status !== 'completed' && r.status !== 'dismissed' && r.status !== 'cancelled');
    }
    if (activeTab === 'completed') {
      return r.status === 'completed' || r.status === 'dismissed' || r.status === 'sent' || r.status === 'failed';
    }
    return true;
  });

  const nowTime = new Date().getTime();
  const pendingCount = reminders.filter(r => r.status === 'scheduled' || r.status === 'snoozed').length;
  const dueCount = reminders.filter(r => (r.status === 'scheduled' || r.status === 'snoozed') && new Date(r.scheduledAt).getTime() <= nowTime).length;

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0A0A0B] text-zinc-100 pb-16">
      {/* Dynamic Background Glow */}
      <div className="fixed top-[-10%] right-[-10%] w-[45%] h-[45%] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[45%] h-[45%] bg-purple-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto p-4 sm:p-8 flex flex-col gap-6">
        
        {/* Navigation & Header */}
        <header className="flex items-center justify-between glass p-4 sm:p-6 rounded-[2rem] border border-blue-500/15 shadow-2xl shadow-blue-500/5">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-zinc-400 hover:text-white border border-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <BellRing className="w-6 h-6 text-blue-400" />
                Reminder Notification Center
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5 font-medium">Production-Ready Web Push & Scheduled Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className={`p-3 rounded-xl transition-all border flex items-center gap-2 text-xs font-semibold ${
                showDebugPanel ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
              }`}
              title="Toggle Debug Panel"
            >
              <Terminal className="w-4 h-4" />
              <span className="hidden sm:inline">Debug Panel</span>
            </button>

            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-all text-blue-400 hover:text-blue-300 flex items-center gap-2 text-xs font-semibold"
              title="Sinkronkan dengan Server Supabase & Pemicu Scheduler"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync & Trigger</span>
            </button>
          </div>
        </header>

        {/* TAHAP 11: DEVELOPMENT DEBUG PANEL */}
        {showDebugPanel && (
          <div className="glass p-5 rounded-[1.8rem] border border-amber-500/30 bg-amber-500/5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-400" />
                <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Development & Timezone Diagnostic Panel</h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold border border-emerald-500/30">
                  Scheduler Ready
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 font-mono">
                <div className="text-zinc-500 text-[10px]">Waktu Lokal (Asia/Jakarta):</div>
                <div className="text-amber-300 font-bold mt-0.5 text-sm">{currentTime.local || 'Calculating...'}</div>
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-white/5 font-mono">
                <div className="text-zinc-500 text-[10px]">Server UTC Time:</div>
                <div className="text-blue-300 font-bold mt-0.5 text-[11px] truncate">{currentTime.utc || 'Calculating...'}</div>
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-white/5 font-mono">
                <div className="text-zinc-500 text-[10px]">Status Scheduler DB:</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-white font-bold">Pending: <span className="text-amber-400">{pendingCount}</span></span>
                  <span className="text-white font-bold">Due: <span className="text-emerald-400">{dueCount}</span></span>
                </div>
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-white/5 font-mono">
                <div className="text-zinc-500 text-[10px]">Web Push Sub DB:</div>
                <div className={`font-bold mt-0.5 ${subscriptionActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {subscriptionActive ? 'Active Registered' : 'Not Registered'}
                </div>
              </div>
            </div>

            <div className="text-[11px] bg-black/60 p-3 rounded-xl border border-white/10 font-mono text-zinc-300 space-y-1">
              <div className="text-amber-400 font-bold flex items-center justify-between">
                <span>[LOG SCHEDULER LOCAL]:</span>
                <span className="text-zinc-500 text-[10px]">Command: npm run scheduler:dev</span>
              </div>
              <p>1. Local scheduler polling interval: <b>10 Detik</b> di <b>http://localhost:3000/api/push/cron</b></p>
              <p>2. Timezone conversion: Local <b>{timezone}</b> -&gt; <b>UTC ISO String</b> sebelum disimpan ke Supabase DB.</p>
              <p>3. State transition: <b>scheduled</b> -&gt; <b>processing</b> -&gt; <b>sent</b> (dengan Idempotency Lock).</p>
              {lastCronResult && (
                <div className="mt-2 pt-2 border-t border-white/10 text-emerald-300">
                  Last Manual Trigger: Checked={lastCronResult.checkedAt} | Found={lastCronResult.foundCount} | Sent={lastCronResult.successPushCount}
                </div>
              )}
            </div>

            {/* Diagnostic Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-amber-500/20">
              <button
                onClick={testScheduledReminder30s}
                className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                title="Buat reminder 30 detik dari sekarang"
              >
                <Clock className="w-4 h-4 text-emerald-400" /> Uji Scheduled (30s)
              </button>

              <button
                onClick={testServerCloudPush}
                className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4 text-purple-400" /> Uji Cloud Push
              </button>

              <button
                onClick={testForegroundNotification}
                className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Monitor className="w-4 h-4 text-blue-400" /> Sticky Notification
              </button>

              <button
                onClick={handleEmergencyCleanup}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                title="Batalkan seluruh test reminder lama di DB & bersihkan notifikasi aktif"
              >
                <Trash2 className="w-4 h-4 text-red-400" /> Cleanup Test Reminders
              </button>
            </div>
          </div>
        )}

        {/* System Diagnostic Status Bar */}
        <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Status Infrastruktur Notifikasi</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${dbSynced ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-xs text-zinc-400 font-semibold">
                {dbSynced ? 'Database Cloud Sync (Online)' : 'IndexedDB Local Cache'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Permission Status */}
            <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/5">
              <span className="text-zinc-400 font-medium">Browser Permission:</span>
              <span className={`font-bold flex items-center gap-1.5 ${permission === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {permission === 'granted' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {permission === 'granted' ? 'Granted' : permission === 'denied' ? 'Denied' : 'Default'}
              </span>
            </div>

            {/* Service Worker Status */}
            <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/5">
              <span className="text-zinc-400 font-medium">Service Worker:</span>
              <span className={`font-bold flex items-center gap-1.5 ${swActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                {swActive ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {swActive ? 'Active (Background)' : 'Inactive'}
              </span>
            </div>

            {/* Push Subscription Status */}
            <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/5">
              <span className="text-zinc-400 font-medium">Web Push Sub:</span>
              <span className={`font-bold flex items-center gap-1.5 ${subscriptionActive ? 'text-emerald-400' : 'text-blue-400'}`}>
                {subscriptionActive ? <Send className="w-3.5 h-3.5 text-emerald-400" /> : <BellOff className="w-3.5 h-3.5" />}
                {subscriptionActive ? 'Subscribed' : 'Not Subscribed'}
              </span>
            </div>
          </div>

          {/* Quick Subscription Action */}
          <div className="flex items-center justify-between pt-1">
            {permission !== 'granted' ? (
              <button
                onClick={requestPermission}
                className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" /> Izinkan Notifikasi Browser
              </button>
            ) : subscriptionActive ? (
              <button
                onClick={unsubscribePush}
                className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2"
              >
                <BellOff className="w-4 h-4" /> Unsubscribe Push
              </button>
            ) : (
              <button
                onClick={() => syncPushSubscription(true)}
                className="px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <BellRing className="w-4 h-4" /> Register Push Sub
              </button>
            )}
            
            <span className="text-[11px] text-zinc-500">
              Pengingat tersinkronisasi otomatis via Vercel Cron / Local Engine
            </span>
          </div>
        </div>

        {/* Action Controls & Tab Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1">
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'active' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Aktif / Snoozed ({reminders.filter(r => r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'processing' || r.isActive).length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'completed' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Selesai / Terkirim ({reminders.filter(r => r.status === 'completed' || r.status === 'dismissed' || r.status === 'sent' || r.status === 'failed').length})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'all' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Semua ({reminders.length})
            </button>
          </div>

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/25 font-bold text-xs transition-all"
          >
            <Plus className="w-4 h-4" /> Buat Pengingat Baru
          </button>
        </div>

        {/* Add / Edit Form Drawer */}
        <AnimatePresence>
          {isAdding && (
            <motion.form
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              onSubmit={handleAddOrUpdate}
              className="glass p-6 rounded-[1.8rem] border border-blue-500/20 mb-2 overflow-hidden shadow-2xl"
            >
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-400" />
                {editingId ? "Edit Pengingat" : "Buat Pengingat Terjadwal Baru"}
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-full">
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Judul Pengingat *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Meeting Koordinasi Pimpinan, Bayar Server, Tagihan..."
                    className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/60 text-sm"
                  />
                </div>

                <div className="col-span-full">
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Pesan Tambahan / Details (Body)</label>
                  <input
                    type="text"
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    placeholder="Deskripsi singkat pengingat..."
                    className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/60 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Tanggal Eksekusi</label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/60 text-sm [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Waktu (HH:mm)</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/60 text-sm [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Timezone IANA</label>
                  <div className="relative">
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/60 text-sm [&>option]:bg-[#121214]"
                    >
                      <option value="Asia/Jakarta">Asia/Jakarta (WIB GMT+7)</option>
                      <option value="Asia/Makassar">Asia/Makassar (WITA GMT+8)</option>
                      <option value="Asia/Jayapura">Asia/Jayapura (WIT GMT+9)</option>
                      <option value="UTC">UTC (GMT+0)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Frekuensi Pengulangan</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as Frequency)}
                    className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/60 text-sm [&>option]:bg-[#121214]"
                  >
                    <option value="once">Sekali Jalan (One-time)</option>
                    <option value="daily">Setiap Hari (Daily)</option>
                    <option value="weekdays">Hari Kerja (Senin - Jumat)</option>
                    <option value="weekly">Mingguan (Hari ini saja)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-5 mt-2 border-t border-white/10">
                <button type="button" onClick={resetForm} className="px-5 py-2.5 text-zinc-400 hover:text-white font-semibold rounded-xl text-xs transition-colors">
                  Batal
                </button>
                <button type="submit" className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-blue-500/20">
                  {editingId ? "Perbarui Pengingat" : "Jadwalkan Pengingat"}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Reminder Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReminders.length > 0 ? (
            filteredReminders.map(reminder => {
              const isSnoozed = reminder.status === 'snoozed';
              const isProcessing = reminder.status === 'processing';
              const isCompleted = reminder.status === 'completed' || reminder.status === 'dismissed';

              return (
                <div 
                  key={reminder.id} 
                  className={`glass p-5 rounded-[1.8rem] border flex flex-col relative overflow-hidden group transition-all ${
                    isSnoozed ? 'border-amber-500/40 bg-amber-500/5' :
                    isProcessing ? 'border-blue-500/40 bg-blue-500/5 animate-pulse' :
                    isCompleted ? 'border-white/5 opacity-65' :
                    'border-white/10 hover:border-blue-500/30'
                  }`}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    isSnoozed ? 'bg-amber-400' :
                    isProcessing ? 'bg-amber-300' :
                    isCompleted ? 'bg-zinc-600' :
                    reminder.isActive ? 'bg-blue-500' : 'bg-zinc-700'
                  }`} />

                  <div className="flex justify-between items-start mb-2 pl-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`font-bold text-base ${isCompleted ? 'line-through text-zinc-400' : 'text-white'}`}>
                          {reminder.title}
                        </h3>
                        {isSnoozed && (
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-full border border-amber-500/30">
                            SNOOZED
                          </span>
                        )}
                        {isProcessing && (
                          <span className="px-2 py-0.5 bg-amber-400/20 text-amber-300 text-[10px] font-bold rounded-full border border-amber-400/30 animate-pulse">
                            PROCESSING
                          </span>
                        )}
                        {reminder.status === 'sent' && (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/30">
                            SENT
                          </span>
                        )}
                        {reminder.status === 'failed' && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-300 text-[10px] font-bold rounded-full border border-red-500/30">
                            FAILED
                          </span>
                        )}
                      </div>
                      {reminder.body && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{reminder.body}</p>
                      )}
                    </div>

                    <button
                      onClick={() => toggleReminder(reminder.id)}
                      className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors ${
                        reminder.isActive ? "bg-blue-500" : "bg-zinc-700"
                      }`}
                      title={reminder.isActive ? "Nonaktifkan" : "Aktifkan"}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          reminder.isActive ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  
                  <div className="flex flex-col gap-2.5 mt-auto pt-3 border-t border-white/5 pl-2">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="font-bold text-white text-sm">{reminder.time}</span>
                        <span className="text-[10px] text-zinc-500">({reminder.timezone || 'Asia/Jakarta'})</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {reminder.frequency === 'daily' ? 'Setiap Hari' :
                           reminder.frequency === 'weekdays' ? 'Hari Kerja' :
                           reminder.frequency === 'weekly' ? 'Mingguan' : 'Satu Kali'}
                        </span>
                      </div>
                    </div>

                    {/* Scheduled UTC Diagnostic Detail */}
                    <div className="text-[10px] font-mono text-zinc-500 bg-white/5 p-1.5 rounded-lg flex items-center justify-between">
                      <span>UTC: {reminder.scheduledAt ? new Date(reminder.scheduledAt).toISOString() : 'N/A'}</span>
                      <span className="text-amber-400 font-bold">{formatLocalFromUTC(reminder.scheduledAt, reminder.timezone || 'Asia/Jakarta')}</span>
                    </div>

                    {/* Quick Snooze & Dismiss Action Buttons */}
                    {!isCompleted && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          onClick={() => snoozeReminder(reminder.id, 5)}
                          className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 rounded-lg text-[11px] font-bold transition-all text-center"
                        >
                          +5 Min
                        </button>
                        <button
                          onClick={() => snoozeReminder(reminder.id, 15)}
                          className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 rounded-lg text-[11px] font-bold transition-all text-center"
                        >
                          +15 Min
                        </button>
                        <button
                          onClick={() => snoozeReminder(reminder.id, 60)}
                          className="flex-1 py-1.5 px-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 rounded-lg text-[11px] font-bold transition-all text-center"
                        >
                          +1 Jam
                        </button>
                        <button
                          onClick={() => updateReminderStatus(reminder.id, 'dismissed')}
                          className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 rounded-lg text-[11px] font-semibold transition-all"
                          title="Tutup / Selesaikan"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Card Footer Actions */}
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[10px] text-zinc-500">
                        {reminder.createdAt ? `Dibuat: ${new Date(reminder.createdAt).toLocaleDateString('id-ID')}` : ''}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(reminder)}
                          className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteReminder(reminder.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-16 flex flex-col items-center justify-center text-center glass rounded-[2rem] border border-white/5">
              <Bell className="w-16 h-16 text-zinc-700 mb-4" />
              <h3 className="text-base font-bold text-zinc-400">Tidak ada pengingat dalam kategori ini</h3>
              <p className="text-zinc-500 text-xs max-w-sm mt-1">Pengingat tersinkron secara otomatis antara database Supabase dan IndexedDB lokal.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
