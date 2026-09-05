"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, ShieldAlert, CheckCircle2, RefreshCw, Send, Terminal, Wifi, Database, Layers, Smartphone, Trash2, Bell, Calendar, Clock, AlertCircle, Play, XCircle, Wrench } from "lucide-react";
import Link from "next/link";
import Swal from "sweetalert2";
import { getRemindersFromIDB, getOccurrencesFromIDB, getOfflineQueue } from "@/lib/idb";
import { runSyncEngine } from "@/lib/sync-engine";
import {
  isNativePlatform,
  checkNativeAlarmPermissions,
  requestExactAlarmPermission,
  scheduleNativeLocalAlarm,
  cancelNativeLocalAlarm,
  cancelAllNativeLocalAlarms,
  getScheduledNativeAlarms
} from "@/lib/native-alarm";

export default function NotificationSettingsPage() {
  const [platformInfo, setPlatformInfo] = useState<string>("");
  const [androidVersion, setAndroidVersion] = useState<string>("Unknown");
  const [capacitorVersion, setCapacitorVersion] = useState<string>("8.5.1");
  const [appVersion, setAppVersion] = useState<string>("0.1.0");

  const [notificationPermission, setNotificationPermission] = useState<string>("default");
  const [exactAlarmPermission, setExactAlarmPermission] = useState<boolean>(true);
  const [nativeAlarmStatus, setNativeAlarmStatus] = useState<string>("INACTIVE");
  const [webPushStatus, setWebPushStatus] = useState<string>("INACTIVE");

  const [swActive, setSwActive] = useState<boolean>(false);
  const [swScope, setSwScope] = useState<string>("");
  const [subscriptionActive, setSubscriptionActive] = useState<boolean>(false);
  const [endpointSnippet, setEndpointSnippet] = useState<string>("");

  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [indexedDbStatus, setIndexedDbStatus] = useState<string>("OK");
  const [supabaseStatus, setSupabaseStatus] = useState<string>("CONNECTED");
  const [lastSyncTime, setLastSyncTime] = useState<string>("Belum ada");

  // Local & Native Alarm Stats
  const [idbRemindersCount, setIdbRemindersCount] = useState<number>(0);
  const [idbOccurrencesCount, setIdbOccurrencesCount] = useState<number>(0);
  const [idbQueueCount, setIdbQueueCount] = useState<number>(0);
  const [nativeAlarmCount, setNativeAlarmCount] = useState<number>(0);
  const [nextAlarmTime, setNextAlarmTime] = useState<string>("Tidak ada");

  const [testAlarmActive, setTestAlarmActive] = useState<boolean>(false);
  const [isTestingPush, setIsTestingPush] = useState<boolean>(false);
  const [isTestingLocal, setIsTestingLocal] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const runDiagnosticCheck = async () => {
    setIsRefreshing(true);
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent;
    setPlatformInfo(`${navigator.platform} - ${ua.substring(0, 45)}...`);
    setIsOnline(navigator.onLine);

    // Extract Android Version from UserAgent if on Android
    const androidMatch = ua.match(/Android\s+([0-9\.]+)/i);
    if (androidMatch && androidMatch[1]) {
      setAndroidVersion(`Android ${androidMatch[1]}`);
    } else {
      setAndroidVersion("Non-Android OS");
    }

    // 1. Notification & Exact Alarm Permission Check
    const permStatus = await checkNativeAlarmPermissions();
    setNotificationPermission(permStatus.notifications);
    setExactAlarmPermission(permStatus.exactAlarm);

    if (isNativePlatform()) {
      setNativeAlarmStatus(permStatus.exactAlarm && permStatus.notifications === 'granted' ? 'ACTIVE' : 'INACTIVE (Permission Required)');
    } else {
      setNativeAlarmStatus('INACTIVE (Web/PWA Mode)');
    }

    // 2. Service Worker & Push Check
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        setSwActive(true);
        setSwScope(reg.scope);

        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setSubscriptionActive(true);
          setWebPushStatus("ACTIVE");
          setEndpointSnippet(sub.endpoint.substring(0, 40) + '...');
        } else {
          setSubscriptionActive(false);
          setWebPushStatus("INACTIVE");
          setEndpointSnippet("");
        }
      } catch (err) {
        setSwActive(false);
        setSubscriptionActive(false);
        setWebPushStatus("INACTIVE");
      }
    }

    // 3. IndexedDB Stats & Supabase check
    try {
      const rems = await getRemindersFromIDB();
      const occs = await getOccurrencesFromIDB();
      const queue = await getOfflineQueue();
      setIdbRemindersCount(rems.length);
      setIdbOccurrencesCount(occs.length);
      setIdbQueueCount(queue.length);
      setIndexedDbStatus("OK");

      // Calculate Next Scheduled Alarm
      const activeOccs = occs
        .filter(o => o.status === 'scheduled' || o.status === 'snoozed')
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

      if (activeOccs.length > 0) {
        const nextTarget = new Date(activeOccs[0].scheduledAt);
        setNextAlarmTime(nextTarget.toLocaleString('id-ID'));
      } else {
        setNextAlarmTime("Tidak ada");
      }
    } catch (e) {
      setIndexedDbStatus("ERROR");
    }

    // 4. Check Native Scheduled Alarms
    if (isNativePlatform()) {
      const scheduled = await getScheduledNativeAlarms();
      setNativeAlarmCount(scheduled.length);
    } else {
      setNativeAlarmCount(0);
    }

    // 5. Supabase connection check
    if (navigator.onLine) {
      try {
        const res = await fetch('/api/reminders', { method: 'HEAD' });
        setSupabaseStatus(res.ok ? "CONNECTED" : "OFFLINE / SERVER ERROR");
      } catch (e) {
        setSupabaseStatus("OFFLINE");
      }
    } else {
      setSupabaseStatus("OFFLINE");
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

  const handleOpenExactAlarmSettings = async () => {
    const ok = await requestExactAlarmPermission();
    if (!ok) {
      Swal.fire({
        icon: 'info',
        title: 'Pengaturan Alarm Presisi',
        text: 'Silakan izinkan "Alarms & Reminders" (Jadwalkan Alarm Presisi) pada pengaturan aplikasi Android.'
      });
    } else {
      await runDiagnosticCheck();
    }
  };

  const handleTest1MinAlarm = async () => {
    if (!exactAlarmPermission && isNativePlatform()) {
      Swal.fire({
        icon: 'warning',
        title: 'Permission Presisi Belum Diizinkan',
        text: 'Alarm presisi belum diizinkan oleh sistem Android. Silakan klik "AKTIFKAN ALARM" terlebih dahulu.'
      });
      return;
    }

    setIsTestingLocal(true);
    const targetDate = new Date(Date.now() + 60 * 1000);
    const targetISO = targetDate.toISOString();
    const testOccId = `test-1m-occ-${Date.now()}`;

    let scheduledOk = false;

    if (isNativePlatform()) {
      scheduledOk = await scheduleNativeLocalAlarm({
        reminderId: 'test-1m-reminder',
        occurrenceId: testOccId,
        title: '⏰ TEST ALARM 1 MENIT (AgendaRecap)',
        body: 'Dokumen evaluasi dan laptop sudah disiapkan.',
        scheduledAt: targetISO
      });
    } else {
      // PWA Browser Fallback
      setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏰ TEST ALARM 1 MENIT (Browser Fallback)', {
            body: 'Dokumen evaluasi dan laptop sudah disiapkan.',
            icon: '/icon.svg',
            tag: `test-1m-${Date.now()}`
          });
        }
      }, 60000);
      scheduledOk = true;
    }

    setIsTestingLocal(false);

    if (scheduledOk) {
      setTestAlarmActive(true);
      Swal.fire({
        icon: 'success',
        title: 'Alarm Berhasil Dijadwalkan (+1 Menit)',
        text: 'Anda dapat menutup aplikasi atau mematikan internet. Alarm native akan tetap berbunyi tepat dalam 1 menit.'
      });
      await runDiagnosticCheck();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menjadwalkan Test Alarm',
        text: 'Pastikan permission notifikasi dan exact alarm sudah diberikan.'
      });
    }
  };

  const handleCancelTestAlarm = async () => {
    if (isNativePlatform()) {
      await cancelAllNativeLocalAlarms();
    }
    setTestAlarmActive(false);
    Swal.fire({
      icon: 'info',
      title: 'Test Alarm Dibatalkan',
      text: 'Semua test alarm aktif berhasil dibatalkan.'
    });
    await runDiagnosticCheck();
  };

  const handleTestPush = async () => {
    setIsTestingPush(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        Swal.fire({ icon: 'error', title: 'Push Subscription Kosong', text: 'Perangkat belum terdaftar untuk Web Push.' });
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
        Swal.fire({ icon: 'success', title: 'Test Web Push Terkirim!', text: 'Notifikasi push akan muncul dalam 2 detik.' });
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
      text: `Status: ${res.success ? 'Berhasil' : 'Dengan Catatan'} | Item Tersinkron: ${res.syncedCount}`
    });
  };

  const handleRebuildLocalAlarms = async () => {
    const result = await Swal.fire({
      title: 'Rebuild Local Alarms?',
      text: 'Operasi ini akan menjadwalkan ulang seluruh alarm lokal dari data yang tersimpan di IndexedDB.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Rebuild',
      cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    setIsRefreshing(true);
    try {
      const occs = await getOccurrencesFromIDB();
      const rems = await getRemindersFromIDB();

      const activeOccs = occs.filter(o => o.status === 'scheduled' || o.status === 'snoozed');

      let reScheduledCount = 0;
      for (const occ of activeOccs) {
        const parent = rems.find(r => r.id === occ.reminderId);
        const targetTime = occ.snoozedUntil || occ.scheduledAt;

        if (new Date(targetTime).getTime() > Date.now()) {
          await scheduleNativeLocalAlarm({
            reminderId: occ.reminderId,
            occurrenceId: occ.id,
            title: parent?.title || 'Pengingat AgendaRecap',
            body: parent?.body || '',
            scheduledAt: targetTime
          });
          reScheduledCount++;
        }
      }

      await runDiagnosticCheck();
      Swal.fire({
        icon: 'success',
        title: 'Rebuild Selesai',
        text: `Berhasil menjadwalkan ulang ${reScheduledCount} alarm lokal native.`
      });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Rebuild Gagal', text: e.message });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCancelAllAlarms = async () => {
    const result = await Swal.fire({
      title: 'Batalkan Seluruh Alarm?',
      text: 'Semua alarm lokal native yang sedang terjadwal akan dibatalkan.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Ya, Batalkan Semua',
      cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    if (isNativePlatform()) {
      await cancelAllNativeLocalAlarms();
    }
    setTestAlarmActive(false);
    await runDiagnosticCheck();
    Swal.fire({ icon: 'success', title: 'Seluruh Alarm Lokal Dibatalkan' });
  };

  return (
    <main className="min-h-screen relative bg-[#0A0A0B] text-zinc-100 p-4 sm:p-8 pb-24">
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
                Pengaturan Notifikasi & Alarm
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 font-medium">Native Android Alarm Engine & Diagnostic Panel</p>
            </div>
          </div>

          <button
            onClick={runDiagnosticCheck}
            disabled={isRefreshing}
            className="p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all text-amber-300 flex items-center gap-2 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">REFRESH STATUS</span>
          </button>
        </header>

        {/* Exact Alarm Permission Banner */}
        {!exactAlarmPermission && isNativePlatform() && (
          <div className="glass p-5 rounded-[1.8rem] border border-red-500/40 bg-red-500/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-red-300 text-sm">Alarm Presisi Belum Diizinkan</h3>
                <p className="text-xs text-zinc-300">
                  Android membutuhkan izin khusus "Jadwalkan Alarm Presisi" agar pengingat dapat berbunyi tepat waktu saat HP di-lock atau offline.
                </p>
              </div>
            </div>
            <button
              onClick={handleOpenExactAlarmSettings}
              className="w-full sm:w-auto px-5 py-2.5 bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg transition-all shrink-0 flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4" /> AKTIFKAN ALARM
            </button>
          </div>
        )}

        {/* Core Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Notification Permission */}
          <div className="glass p-4 rounded-[1.5rem] border border-white/10 flex flex-col justify-between gap-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-purple-400" /> Notification
            </span>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-black ${notificationPermission === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {notificationPermission.toUpperCase()}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-zinc-400">OS Permission</span>
            </div>
          </div>

          {/* Exact Alarm Permission */}
          <div className="glass p-4 rounded-[1.5rem] border border-white/10 flex flex-col justify-between gap-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-400" /> Exact Alarm
            </span>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-black ${exactAlarmPermission ? 'text-emerald-400' : 'text-red-400'}`}>
                {exactAlarmPermission ? 'GRANTED' : 'DENIED'}
              </span>
              {!exactAlarmPermission && isNativePlatform() && (
                <button onClick={handleOpenExactAlarmSettings} className="text-[10px] text-amber-400 underline font-bold">
                  IZINKAN
                </button>
              )}
            </div>
          </div>

          {/* Native Alarm */}
          <div className="glass p-4 rounded-[1.5rem] border border-white/10 flex flex-col justify-between gap-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-amber-400" /> Native Alarm
            </span>
            <span className={`text-sm font-black ${nativeAlarmStatus.startsWith('ACTIVE') ? 'text-emerald-400' : 'text-amber-400'}`}>
              {nativeAlarmStatus.startsWith('ACTIVE') ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>

          {/* Web Push */}
          <div className="glass p-4 rounded-[1.5rem] border border-white/10 flex flex-col justify-between gap-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Send className="w-4 h-4 text-emerald-400" /> Web Push
            </span>
            <span className={`text-sm font-black ${webPushStatus === 'ACTIVE' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {webPushStatus}
            </span>
          </div>

        </div>

        {/* System & Connectivity Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Connection & Database Status */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
              <Database className="w-4 h-4 text-emerald-400" /> Status Database & Koneksi
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">Internet:</span>
                <span className={`font-bold ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">IndexedDB:</span>
                <span className={`font-bold ${indexedDbStatus === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {indexedDbStatus}
                </span>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">Supabase Source:</span>
                <span className={`font-bold ${supabaseStatus.startsWith('CONNECTED') ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {supabaseStatus}
                </span>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">Last Sync:</span>
                <span className="font-bold text-amber-300 truncate">{lastSyncTime}</span>
              </div>
            </div>
          </div>

          {/* Alarm Timers & Count */}
          <div className="glass p-5 rounded-[1.8rem] border border-white/10 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
              <Clock className="w-4 h-4 text-amber-400" /> Pengingat & Jadwal Terdekat
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">Local Reminders:</span>
                <span className="font-bold text-white">{idbRemindersCount} item</span>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">Local Occurrences:</span>
                <span className="font-bold text-white">{idbOccurrencesCount} item</span>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">Native OS Alarms:</span>
                <span className="font-bold text-amber-300">{nativeAlarmCount} alarm</span>
              </div>

              <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-zinc-400">Pending Sync Queue:</span>
                <span className="font-bold text-purple-300">{idbQueueCount} mutasi</span>
              </div>
            </div>

            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-xs flex justify-between items-center">
              <span className="text-amber-300 font-bold">Alarm Terdekat Berikutnya:</span>
              <span className="font-black text-white">{nextAlarmTime}</span>
            </div>
          </div>

        </div>

        {/* Test Alarm Controls (Requirement 25) */}
        <div className="glass p-6 rounded-[2rem] border border-amber-500/30 bg-amber-500/5 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
            <Play className="w-4 h-4 text-amber-400" /> Pengujian Alarm & Local Notification
          </h2>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-zinc-300">
              Tekan <strong className="text-white">TEST ALARM 1 MENIT</strong> untuk menjadwalkan alarm native OS +1 menit.
              Anda dapat mengunci HP atau mematikan internet untuk menguji alarm offline.
            </p>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleTest1MinAlarm}
                disabled={isTestingLocal}
                className="w-full sm:w-auto px-5 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 shrink-0"
              >
                <Clock className="w-4 h-4" /> TEST ALARM 1 MENIT
              </button>

              <button
                onClick={handleCancelTestAlarm}
                className="w-full sm:w-auto px-4 py-3 bg-white/10 hover:bg-white/20 text-zinc-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shrink-0"
              >
                <XCircle className="w-4 h-4 text-red-400" /> CANCEL TEST ALARM
              </button>
            </div>
          </div>
        </div>

        {/* Developer Diagnostics Panel (Requirement 26) */}
        <div className="glass p-6 rounded-[2rem] border border-white/10 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400" /> Panel Diagnostik Developer
          </h2>

          {/* System Info Table */}
          <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-2 text-xs font-mono text-zinc-400">
            <div className="flex justify-between"><span>Platform OS:</span><span className="text-white truncate">{platformInfo}</span></div>
            <div className="flex justify-between"><span>Android Version:</span><span className="text-white">{androidVersion}</span></div>
            <div className="flex justify-between"><span>App Version:</span><span className="text-white">{appVersion}</span></div>
            <div className="flex justify-between"><span>Capacitor SDK:</span><span className="text-white">{capacitorVersion}</span></div>
            <div className="flex justify-between"><span>Service Worker Scope:</span><span className="text-emerald-400 truncate">{swScope || 'None'}</span></div>
          </div>

          {/* Diagnostic Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <button
              onClick={runDiagnosticCheck}
              className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-blue-400" /> REFRESH STATUS
            </button>

            <button
              onClick={handleTestSync}
              className="p-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-purple-400" /> RESYNC
            </button>

            <button
              onClick={handleRebuildLocalAlarms}
              className="p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Wrench className="w-4 h-4 text-amber-400" /> REBUILD ALARMS
            </button>

            <button
              onClick={handleCancelAllAlarms}
              className="p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4 text-red-400" /> CANCEL ALL ALARMS
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
