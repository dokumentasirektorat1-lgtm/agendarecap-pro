"use client";

import { useState, useEffect } from "react";
import { useReminderStore, Reminder, Frequency } from "@/store/useReminderStore";
import { Bell, BellRing, Plus, Trash2, ArrowLeft, Clock, Calendar, ShieldAlert, Edit2, RefreshCw, Zap, CheckCircle2, AlertTriangle, Monitor } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Swal from "sweetalert2";

export default function RemindersPage() {
  const { reminders, dbSynced, fetchReminders, addReminder, toggleReminder, deleteReminder, updateReminder } = useReminderStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("08:00");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [sound, setSound] = useState<string>("default");
  
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [swActive, setSwActive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchReminders();
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setSwActive(true)).catch(() => setSwActive(false));
    }
  }, [fetchReminders]);

  // Sync with Web Push Backend Server to empower offline notifications
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || permission !== 'granted') return;
    
    let isMounted = true;
    const syncWithBackend = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
          const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!VAPID_KEY) return;
          
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
        
        if (subscription && isMounted) {
          await fetch('/api/push/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription, reminders })
          });
        }
      } catch (e) {
        console.error("Failed to sync push subscription:", e);
      }
    };
    
    syncWithBackend();
    return () => { isMounted = false; };
  }, [reminders, permission]);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      Swal.fire({ icon: 'error', title: 'Tidak Didukung', text: 'Browser tidak mendukung Notifikasi.' });
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Notifikasi Diaktifkan', showConfirmButton: false, timer: 1500 });
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    await fetchReminders();
    setIsSyncing(false);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Tersinkronisasi dengan Cloud',
      showConfirmButton: false,
      timer: 1500
    });
  };

  const testForegroundNotification = async () => {
    if (permission !== 'granted') {
      await requestPermission();
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification("Pengingat Uji Coba PC (Foreground)", {
        body: "Ini adalah notifikasi uji coba dengan mode sticky. Notifikasi ini tidak akan hilang sampai Anda mengkliknya.",
        icon: "/icon-192x192.png",
        tag: "test-foreground",
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
      });
    } else {
      new Notification("Pengingat Uji Coba PC", {
        body: "Notifikasi browser aktif.",
        icon: "/icon-192x192.png",
        requireInteraction: true
      });
    }
  };

  const testBackgroundNotification = async () => {
    if (permission !== 'granted') {
      await requestPermission();
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'TEST_BACKGROUND_PUSH',
        delayMs: 5000,
        title: '🔔 Uji Notifikasi App Tertutup (5 Detik)',
        body: 'Notifikasi ini berhasil muncul secara otomatis meskipun tab atau aplikasi dalam keadaan tertutup!'
      });

      Swal.fire({
        title: 'Tutup Tab Ini Sekarang!',
        text: 'Notifikasi akan muncul dalam 5 detik di perangkat ini (PC/Android) meskipun tab/aplikasi sudah ditutup.',
        icon: 'info',
        confirmButtonText: 'Siap, Tutup Tab',
        timer: 4000
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Service Worker Belum Siap',
        text: 'Muat ulang halaman sekali lagi untuk mengaktifkan Service Worker Latar Belakang.'
      });
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    
    if (editingId) {
      updateReminder(editingId, {
        title,
        time,
        frequency,
        sound,
        daysOfWeek: frequency === 'weekly' ? [new Date().getDay()] : undefined
      });
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pengingat Diperbarui', showConfirmButton: false, timer: 1500 });
    } else {
      addReminder({
        title,
        time,
        frequency,
        sound,
        daysOfWeek: frequency === 'weekly' ? [new Date().getDay()] : undefined
      });
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pengingat Ditambahkan', showConfirmButton: false, timer: 1500 });
    }
    
    resetForm();
  };

  const resetForm = () => {
    setTitle("");
    setTime("08:00");
    setFrequency("daily");
    setSound("default");
    setEditingId(null);
    setIsAdding(false);
  };

  const handleEdit = (reminder: Reminder) => {
    setTitle(reminder.title);
    setTime(reminder.time);
    setFrequency(reminder.frequency);
    setSound(reminder.sound || "default");
    setEditingId(reminder.id);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0A0A0B]">
      {/* Background Ornaments */}
      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto p-4 sm:p-8 flex flex-col gap-6">
        
        {/* Header */}
        <header className="flex items-center justify-between glass p-4 sm:p-6 rounded-[2rem] border border-blue-500/10 shadow-xl shadow-blue-500/5">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                <BellRing className="w-6 h-6 text-blue-400" />
                Pengingat Pribadi
              </h1>
              <p className="text-sm text-zinc-400 mt-1">Notifikasi tersinkronisasi antar perangkat & aktif saat aplikasi tertutup</p>
            </div>
          </div>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white flex items-center gap-2 text-xs font-semibold"
            title="Paksa Sinkronkan Perangkat"
          >
            <RefreshCw className={`w-4 h-4 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Cloud</span>
          </button>
        </header>

        {/* Sync & Diagnostic Status Panel */}
        <div className="glass p-5 rounded-[1.5rem] border border-white/10 flex flex-col gap-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Status & Uji Coba Notifikasi</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${dbSynced ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
              <span className="text-xs text-zinc-400 font-medium">
                {dbSynced ? 'Terhubung Ke Cloud Database' : 'Lokal Mode (Persist)'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="text-zinc-400">Izin Notifikasi:</span>
              <span className={`font-bold flex items-center gap-1 ${permission === 'granted' ? 'text-emerald-400' : 'text-orange-400'}`}>
                {permission === 'granted' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {permission === 'granted' ? 'Diizinkan' : 'Belum Diizinkan'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="text-zinc-400">Service Worker:</span>
              <span className={`font-bold flex items-center gap-1 ${swActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {swActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {swActive ? 'Aktif (Background)' : 'Memuat...'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="text-zinc-400">Sync Perangkat:</span>
              <span className="font-bold text-blue-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aktif (Akun)
              </span>
            </div>
          </div>

          {/* Test Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={testForegroundNotification}
              className="flex-1 px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Monitor className="w-4 h-4 text-blue-400" /> Uji Popup PC (Sticky Mode)
            </button>
            <button
              onClick={testBackgroundNotification}
              className="flex-1 px-4 py-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 text-purple-400" /> Uji App Tertutup (5 Detik Timer)
            </button>
          </div>
        </div>

        {permission !== 'granted' && (
          <div className="flex items-center justify-between p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-orange-400" />
              <div>
                <p className="text-sm font-semibold text-white">Izinkan Notifikasi</p>
                <p className="text-xs text-orange-400/80">Pengingat membutuhkan izin notifikasi untuk tampil di perangkat ini.</p>
              </div>
            </div>
            <button onClick={requestPermission} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors">
              Izinkan
            </button>
          </div>
        )}

        <div className="flex justify-between items-center px-2">
          <h2 className="text-lg font-bold text-white">Daftar Pengingat</h2>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 font-semibold text-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Tambah Baru
          </button>
        </div>

        <AnimatePresence>
          {isAdding && (
            <motion.form
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              onSubmit={handleAdd}
              className="glass p-5 rounded-[1.5rem] border border-white/10 mb-4 overflow-hidden"
            >
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Judul Pengingat</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Absensi Harian, Bayar Listrik..."
                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="w-1/3">
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">Waktu</label>
                    <input
                      type="time"
                      required
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 [color-scheme:dark]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">Frekuensi / Rutinitas</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as Frequency)}
                      className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/5 [&>option]:bg-[#121214]"
                    >
                      <option value="once">Sekali Jalan (One-time)</option>
                      <option value="daily">Setiap Hari (Daily)</option>
                      <option value="weekdays">Hari Kerja (Senin-Jumat)</option>
                      <option value="weekly">Mingguan (Hari ini)</option>
                    </select>
                  </div>
                  <div className="w-1/3">
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">Suara Notifikasi</label>
                    <select
                      value={sound}
                      onChange={(e) => setSound(e.target.value)}
                      className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/5 [&>option]:bg-[#121214]"
                    >
                      <option value="default">Sistem / Default</option>
                      <option value="beep">Beep Ringan (Web)</option>
                      <option value="chime">Lonceng (Web)</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={resetForm} className="px-6 py-2.5 text-zinc-400 hover:text-white font-semibold rounded-xl transition-colors">
                    Batal
                  </button>
                  <button type="submit" className="px-6 py-2.5 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20">
                    {editingId ? "Perbarui" : "Simpan"}
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reminders.length > 0 ? (
            reminders.map(reminder => (
              <div key={reminder.id} className="glass p-5 rounded-[1.5rem] border border-white/5 flex flex-col relative overflow-hidden group hover:border-white/10 transition-colors">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${reminder.isActive ? 'bg-blue-500' : 'bg-zinc-700'}`} />
                <div className="flex justify-between items-start mb-3">
                  <h3 className={`font-bold text-lg ${reminder.isActive ? 'text-white' : 'text-zinc-500'}`}>{reminder.title}</h3>
                  <button
                    onClick={() => toggleReminder(reminder.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      reminder.isActive ? "bg-blue-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        reminder.isActive ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                
                <div className="flex flex-col gap-2 mt-auto">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Clock className="w-4 h-4 text-blue-400/80" />
                    <span className="font-semibold text-white">{reminder.time}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                      <Calendar className="w-4 h-4" />
                      <span className="uppercase tracking-wider">
                        {reminder.frequency === 'daily' ? 'Setiap Hari' :
                         reminder.frequency === 'weekdays' ? 'Senin - Jumat' :
                         reminder.frequency === 'weekly' ? 'Mingguan' : 'Satu Kali'}
                      </span>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(reminder)}
                        className="p-2 text-zinc-600 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteReminder(reminder.id)}
                        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center">
              <Bell className="w-16 h-16 text-zinc-700 mb-4" />
              <h3 className="text-lg font-bold text-zinc-400">Belum ada pengingat</h3>
              <p className="text-zinc-500 text-sm max-w-sm mt-1">Pengingat Anda akan tersinkronisasi otomatis di semua perangkat yang terhubung.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
