# ROOT CAUSE ANALYSIS - AgendaRecap Pro

**Dokumen:** Root Cause Analysis (RCA)  
**Tanggal:** 8 September 2026  
**Status:** Audit Selesai - Siap Evaluasi  

---

## 1. DAFTAR MASALAH & MASALAH UTAMA

| No | Gejala / Masalah | Root Cause (Penyebab Akar) | File Terkait | Function / Config Terkait |
|---|---|---|---|---|
| 1 | Peringatan "Web page not found" & aplikasi gagal terbuka saat offline / restart | `capacitor.config.ts` dan `MainActivity.kt` memaksa WebView Android memuat URL remote Vercel (`https://agendarecap.vercel.app`) daripada menggunakan bundel web lokal. | `capacitor.config.ts`, `MainActivity.kt` | `server.url`, `checkAndLoadInitialPage()`, `loadUrl(MAIN_APP_URL)` |
| 2 | UI Android tidak dapat dibuka tanpa jaringan internet | `webDir` di `capacitor.config.ts` mengarah ke `'public'` (folder asset statis Next.js) bukannya bundel hasil ekspor aplikasi web (`out`). | `capacitor.config.ts`, `next.config.ts` | `webDir: 'public'`, konfigurasi Next.js build |
| 3 | Sync Engine gagal saat aplikasi native offline / tanpa Node.js server | Sync engine dan data store menggunakan HTTP `fetch('/api/reminders')` ke endpoint Next.js lokal/relative yang tidak ada di Android WebView lokal. | `src/lib/sync-engine.ts`, `src/store/useReminderStore.ts`, `src/store/useStore.ts` | `runSyncEngine()`, `fetchReminders()`, `addReminder()` |
| 4 | Aksi Notifikasi Native (Snooze / Complete) saat offline tidak tersinkronisasi ke cloud | `NotificationActionReceiver.java` hanya mengubah `SharedPreferences` lokal native tanpa mencatat mutasi ke antrean sinkronisasi (Offline Queue) untuk Supabase. | `android/.../NotificationActionReceiver.java`, `src/lib/native-alarm.ts` | `onReceive()`, `AlarmStorage` |
| 5 | Potensi Race Condition saat Auth Restoration + IndexedDB + Supabase Client pada Cold Start | Web UI mencoba menjalankan `runSyncEngine()` sebelum sesi pengguna Supabase dipulihkan dari penyimpanan lokal saat WebView pertama kali aktif. | `src/store/useReminderStore.ts`, `src/components/ServiceWorkerRegistration.tsx` | `fetchReminders()`, `initSyncEngineListeners()` |

---

## 2. DETAIL ALUR EKSEKUSI YANG MEMENUHI PERILAKU TERMASALAHAN

```
[Android App Launch]
        │
        ▼
[MainActivity.onCreate()]
        │
        ▼
[checkAndLoadInitialPage()] ──► Memeriksa koneksi internet
        │
   ┌────┴─────────────────────────┐
   │ (Online)                     │ (Offline / Slow Network)
   ▼                              ▼
webView.loadUrl(Vercel Remote)  loadOfflineFallback()
   │                              │
   ▼                              ▼
Loads Live Web Page from Cloud  Loads public/index.html ("Mode Offline" Amber Screen)
   │                              │
   ▼ (Network drops / 404/500)    ▼
"Web page not found" Error      Pengguna tidak bisa mengakses UI utama aplikasi
```

---

## 3. MENGAPA SOLUSI SEBELUMNYA BELUM PERMANEN

Solusi sebelumnya membuat halaman fallback statis `public/index.html` yang menampilkan teks "Mode Offline - AgendaRecap" dengan tombol reload yang melakukan `window.location.replace("https://agendarecap.vercel.app")`.
- Solusi ini hanya merupakan **workaround sementara** yang menutupi masalah kegagalan koneksi.
- Aplikasi Android **TIDAK** menjalankan kode React/Next.js secara lokal, melainkan hanya menampilkan halaman HTML statis darurat ketika jaringan terputus.

---

## 4. RISIKO JIKA TIDAK DIPERBAIKI

1. **User Experience Rusak**: Setiap kali pengguna berada di daerah minim sinyal, aplikasi Android tidak bisa digunakan sama sekali.
2. **Ketergantungan Total pada Server Vercel**: Kegagalan server Vercel atau DNS problem akan mematikan seluruh aplikasi Android yang sudah terinstal di perangkat pengguna.
3. **Inkonsistensi Data Multi-Device**: Aksi notifikasi yang dilakukan pengguna saat offline (misal menekan "Selesai") tidak pernah sampai ke Supabase, sehingga pengingat di Device B akan tetap berbunyi.

---

## 5. SOLUSI ARSITEKTUR KELAS INDUSTRI (PRODUCTION-READY)

```
WEB (Vercel):
Browser ──► Vercel (Next.js Server) ──► Supabase Cloud ──► Service Worker / Web Push

ANDROID NATIVE (Capacitor):
Android App Launch
   │
   ▼
Capacitor Local Web Bundle (android/app/src/main/assets/public)
   │
   ▼
Local Web UI (React App dari Static Export `out`)
   │
   ├──────► IndexedDB Storage (Reminders, Occurrences, Offline Queue)
   │
   ├──────► Sync Engine (Direct Supabase SDK via REST/Realtime Client)
   │
   └──────► Native Alarm Plugin Bridge
               │
               ▼
       Native Android Layer
       ├── AlarmManager (setExactAndAllowWhileIdle)
       ├── Notification (High-Priority Alarm Channel)
       ├── NotificationActionReceiver (Proses Snooze/Close & Catat Native Queue)
       └── BootReceiver (Restore Alarm setelah Reboot)
```

---

## 6. INVENTARISASI FILE YANG AKAN DIUBAH DAN DITAHAN

### A. File Yang Akan Diubah:
1. `capacitor.config.ts`: Hapus `server.url` untuk pembentukan aplikasi native production, sesuaikan `webDir: 'out'`.
2. `next.config.ts`: Tambahkan dukungan `output: 'export'` berbasis environment variable (`BUILD_TARGET=native`).
3. `android/app/src/main/java/com/agendarecap/app/MainActivity.kt`: Hapus ketergantungan `MAIN_APP_URL` ke Vercel. Biarkan Capacitor memuat `public/index.html` lokal bundel Next.js (`out`).
4. `src/lib/sync-engine.ts`: Ubah operasi sync agar menggunakan **Direct Supabase JS Client** alih-alih `fetch('/api/reminders')`.
5. `src/store/useReminderStore.ts`: Gunakan Supabase Client + IndexedDB secara langsung untuk operasi CRUD & sync.
6. `src/store/useStore.ts`: Gunakan Supabase Client secara langsung untuk operasi agenda harian.
7. `android/app/src/main/java/com/agendarecap/app/NotificationActionReceiver.java`: Tambahkan pencatatan aksi offline ke Native Shared Preferences Queue agar dapat dibaca oleh Web UI Sync Engine ketika aplikasi dibuka kembali.
8. `src/lib/native-alarm.ts`: Tambahkan fungsi membaca Native Event Queue dari `NotificationActionReceiver`.

### B. File Yang TIDAK Boleh Diubah / Dihapus:
1. `vercel.json` (Pertahankan untuk hosting Web/PWA di Vercel).
2. `src/app/api/cron/reminders/route.ts` & `src/lib/reminder-service.ts` (Pertahankan untuk Vercel Cron / Web Push server-side).
3. `public/sw.js` (Pertahankan untuk Web/PWA Service Worker di browser).
4. Schema Supabase Database (Jangan ubah schema yang ada; jika perlu, buat migration script yang aman).

---

## 7. ANALISIS RISIKO REGRESI

| Risiko Regresi | Penyebab Potensial | Strategi Mitigasi |
|---|---|---|
| Versi Web/PWA di Vercel terganggu oleh static export | Mengganti konfigurasi Next.js secara global | Gunakan `BUILD_TARGET=native` saat build Android Capacitor, dan `BUILD_TARGET=web` (default) saat deploy Vercel |
| PWA Service Worker mengganggu WebView Android | SW mencoba mengontrol cache file `capacitor://` atau `https://localhost` | Tambahkan pengecekan `Capacitor.isNativePlatform()` di `ServiceWorkerRegistration.tsx` agar SW hanya aktif di Web Browser |
| Sesi Login hilang saat offline | Auth SDK mencoba refresh token via jaringan | Simpan dan pulihkan Supabase session dari LocalStorage / IndexedDB tanpa memblokir pembukaan UI |
