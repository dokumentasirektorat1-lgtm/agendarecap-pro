# ARCHITECTURE AUDIT - AgendaRecap Pro

**Tanggal Audit:** 8 September 2026  
**Auditor:** Senior Software Architect, Android, Capacitor, Next.js, Supabase & QA Engineer  
**Target Repository:** `agendarecap-pro`

---

## 1. DOKUMENTASI STRUKTUR TEKNOLOGI & KOMPONEN SAAT INI

Aplikasi AgendaRecap Pro dikembangkan sebagai aplikasi **Hybrid Web & Native Android**:
- **Web / PWA**: Framework Next.js 16 (React 19) di-host di Vercel (`https://agendarecap.vercel.app`).
- **Android Native**: Capacitor v8 wrapper yang mengemas WebView Android dan plugin kustom (`NativeAlarmPlugin`).
- **Database & Auth**: Supabase (PostgreSQL, Realtime, Auth).
- **Offline Data**: IndexedDB (`agendaku_pwa_db` dengan store `reminders`, `occurrences`, `offline_queue`, `app_state`).
- **Scheduling**:
  - Android Native: `AlarmManager` via `NativeAlarmPlugin.java`, `AlarmReceiver.java`, `BootReceiver.java`, `NotificationActionReceiver.java`.
  - Web/PWA: Service Worker `sw.js` (Web Push & Notification API).
- **Push Notification**: FCM (`FCMService.kt`) & VAPID Web Push.

---

## 2. TEMUAN AUDIT SPESIFIK BERDASARKAN KODE AKTUAL

### A. Konfigurasi Build & WebView Startup (`capacitor.config.ts` & `MainActivity.kt`)
1. **Penyebab Utama "Web Page Not Found"**:
   - Di `capacitor.config.ts`:
     ```typescript
     webDir: 'public',
     server: {
       url: 'https://agendarecap.vercel.app',
       cleartext: true,
       androidScheme: 'https',
       hostname: 'agendarecap.vercel.app',
       errorPath: 'index.html',
       allowNavigation: ['agendarecap.vercel.app', '*.vercel.app', '*.supabase.co']
     }
     ```
     Konfigurasi `server.url` memaksa Capacitor WebView untuk melakukan navigasi remote HTTP ke Vercel pada saat pembukaan aplikasi.
   - Di `MainActivity.kt`:
     ```kotlin
     private const val MAIN_APP_URL = "https://agendarecap.vercel.app"
     private const val OFFLINE_FALLBACK_URL = "https://appassets.androidview.sandbox/public/index.html"
     
     private fun checkAndLoadInitialPage() {
         if (isNetworkAvailable(this)) {
             webView.loadUrl(MAIN_APP_URL)
         } else {
             loadOfflineFallback(webView)
         }
     }
     ```
     `MainActivity` mengabaikan bundel lokal Capacitor dan memaksa koneksi ke `https://agendarecap.vercel.app`.
   - **Dampak**: Jika koneksi internet terputus saat aplikasi dibuka kembali, WebView mencoba memuat Vercel dan gagal dengan error `"Web page not found"`, atau menampilkan halaman fallback statis (`public/index.html` "Mode Offline") dan bukannya menjalankan aplikasi UI secara penuh.

2. **Ketidaksesuaian Bundel Web Lokal (`webDir`)**:
   - `webDir` dikonfigurasi ke `'public'`, padahal folder `public` di Next.js hanya berisi asset statis (`icon.svg`, `sw.js`, `manifest.json`, `index.html` fallback), bukan bundel kompilasi React/Next.js!
   - Next.js membangun aplikasi ke folder `.next` (atau `out` jika menggunakan `output: 'export'`). Karena itu, bundel lokal Android di `android/app/src/main/assets/public` tidak berisi aplikasi UI Next.js yang sebenarnya.

### B. Arsitektur Data & Synchronization (`sync-engine.ts`, `idb.ts`, `useReminderStore.ts`, `useStore.ts`)
1. **Ketergantungan API Route Lokal pada Sync Engine**:
   - Di `src/lib/sync-engine.ts` dan `useReminderStore.ts`, operasi sync menggunakan `fetch('/api/reminders')`, `fetch('/api/reminders/${id}')`, dsb.
   - Di bundel lokal Android (WebView tanpa Node.js server), URL relatif `/api/...` tidak akan berjalan kecuali terhubung ke server remote.
   - **Solusi Arsitektur**: Sync Engine dan Data Stores pada Web UI Android harus mengakses Supabase Client SDK (`@supabase/supabase-js`) secara langsung untuk query & mutasi data cloud, serta IndexedDB untuk penyimpanan offline lokal.

2. **Penyimpanan Lokal & Queueing Mutasi Offline**:
   - `idb.ts` telah memiliki tabel `offline_queue` (`CREATE_REMINDER`, `UPDATE_REMINDER`, `DELETE_REMINDER`, `SNOOZE_OCCURRENCE`, `COMPLETE_OCCURRENCE`, `DISMISS_OCCURRENCE`).
   - Namun, mutasi offline yang dilakukan dari **Native Notification Action Receiver** (`NotificationActionReceiver.java`) belum dimasukkan ke dalam queue persisten yang dapat dibaca oleh Web UI Sync Engine ketika aplikasi WebView dibuka.

### C. System Reminder Native Android (`AlarmManager`, `AlarmReceiver`, `BootReceiver`, `NotificationActionReceiver`)
1. **Mekanisme Scheduler**:
   - `NativeAlarmPlugin.java` menggunakan `AlarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, scheduledAtMs, pendingIntent)` pada Android 6.0+ (API 23+), yang sudah tepat untuk pengingat presisi tinggi.
   - Pengecekan permission `SCHEDULE_EXACT_ALARM` pada Android 12+ (API 31+) telah diimplementasikan.
2. **Boot Recovery (`BootReceiver.java`)**:
   - `BootReceiver` membaca pengingat dari `AlarmStorage` (SharedPreferences) dan merenjadwalkan alarm untuk `scheduledAtMs > nowMs`.
   - **Temuan**: Pengingat yang kedaluwarsa dibersihkan (`AlarmStorage.removeAlarm`), tetapi jika perangkat mati dalam waktu lama, pengingat yang terlewat tidak tercatat untuk di-sync kembali saat online.
3. **Interactive Notification Actions (`NotificationActionReceiver.java`)**:
   - Tombol aksi `CLOSE` dan `SNOOZE` (5m, 15m, 60m) berjalan secara murni native tanpa membuka WebView.
   - **Temuan**: `NotificationActionReceiver` hanya memperbarui state di `AlarmStorage` (native SharedPreferences). State ini harus ditulis juga ke Native Action Queue / Shared Preference Event Store agar ketika WebView/Sync Engine berjalan, perubahan status (misal: Selesai / Snooze) disinkronkan ke Supabase!

### D. Service Worker & Push Notification (`sw.js`, `FCMService.kt`)
1. **Pemisahan Peran**:
   - `public/sw.js` bertindak sebagai Service Worker PWA (Web Push & Caching untuk Browser).
   - `FCMService.kt` mengelola notifikasi remote FCM untuk Android Native.
   - Service Worker tidak dijadikan scheduler AlarmManager di Android (sudah sesuai arsitektur yang benar).

---

## 3. RINGKASAN AUDIT KOMPONEN

| Komponen | Status Saat Ini | Masalah Utama | Target Perbaikan |
|---|---|---|---|
| **Android WebView Initial Source** | Tergantung Vercel Remote (`server.url`) | Cold start offline gagal ("Web page not found") | Menggunakan bundel web lokal (`out`) |
| **Next.js Build Target** | Next.js Standard Server Build | Tidak menghasilkan static export untuk Capacitor | Menambahkan `BUILD_TARGET=native` (`output: 'export'`) |
| **Offline Data Layer** | IndexedDB (`agendaku_pwa_db`) | Aplikasi bergantung pada `/api/...` endpoints | Menggunakan Direct Supabase SDK + IndexedDB |
| **Sync Engine** | Fetch relative `/api/reminders` | Gagal sync jika offline / tanpa Node server | Direct Supabase REST/Realtime + Queue Retry |
| **Android Scheduler** | Native `AlarmManager` (Bagus) | Berjalan presisi saat app closed/offline | Pertahankan, tambahkan sync queue dari Native Receiver |
| **Boot Recovery** | Native `BootReceiver` (Bagus) | Pulihkan alarm setelah reboot | Pertahankan & sesuaikan validation time |
| **Interactive Action** | Native `NotificationActionReceiver` | Action offline tidak masuk sync queue ke cloud | Simpan aksi ke Native Event Queue untuk diproses Sync Engine |
| **Web/PWA di Vercel** | Berjalan di Vercel | Terpisah dari versi native | Tetap gunakan Vercel untuk Web/PWA tanpa terinterferensi |
