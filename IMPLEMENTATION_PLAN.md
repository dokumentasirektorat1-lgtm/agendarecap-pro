# IMPLEMENTATION PLAN - AgendaRecap Pro

**Dokumen:** Rencana Implementasi Rinci (Phase-by-Phase Execution Plan)  
**Tanggal:** 8 September 2026  
**Status:** DRAFT UNTUK EVUALUASI USER (STEP 2)  

---

## 1. RINGKASAN STRATEGI IMPLEMENTASI

Tujuan utama rencana implementasi ini adalah memperbaiki akar masalah arsitektur pada AgendaRecap Pro agar:
1. Versi Web/PWA tetap berjalan 100% sempurna di Vercel (`https://agendarecap.vercel.app`).
2. Versi Android Native berjalan menggunakan bundel web lokal (`out`), 100% offline-first, tanpa bergantung pada server Vercel untuk membuka UI.
3. Scheduler reminder Android menggunakan `AlarmManager` native (presisi, tahan reboot, tahan force close, tahan offline).
4. Notifikasi interaktif Android (`CLOSE`, `SNOOZE`) diproses native tanpa membuka WebView, dan aksi offline dicatat ke queue untuk disinkronkan ke Supabase saat online.

---

## 2. RENCANA EKSEKUSI TAHAP DEMI TAHAP (STEP 3 PRIORITAS)

```
[Tahap 1: Dual Build Pipeline & Local Web Bundle]
  ├── next.config.ts (BUILD_TARGET=native -> output: 'export', distDir: 'out')
  ├── capacitor.config.ts (Hapus server.url untuk Android, set webDir: 'out')
  └── package.json (Tambahkan script build:native & cap:sync)

[Tahap 2: WebView Startup & Lifecycle Recovery]
  └── MainActivity.kt (Gunakan default Capacitor local asset loader, hapus URL remote Vercel)

[Tahap 3: Direct Supabase Client & Sync Engine Refactoring]
  ├── src/lib/sync-engine.ts (Refactor dari fetch /api/... ke Direct Supabase SDK)
  ├── src/store/useReminderStore.ts (Sync Direct Supabase SDK + IndexedDB)
  └── src/store/useStore.ts (Direct Supabase SDK + Optimistic UI)

[Tahap 4: Native Action Queue & Event Store Synchronization]
  ├── NotificationActionReceiver.java (Catat aksi offline ke SharedPreferences Action Queue)
  ├── NativeAlarmPlugin.java (Expose method getPendingNativeActions & clearPendingNativeActions)
  └── src/lib/native-alarm.ts (Panggil plugin & kirimkan aksi ke Sync Engine)

[Tahap 5: Isolasi PWA Service Worker & FCM]
  └── ServiceWorkerRegistration.tsx (Cegah SW menggantikan Capacitor WebView di Android)

[Tahap 6: Validasi & Test Matrix Execution]
  ├── npm run lint & npx tsc --noEmit
  ├── npm run build & npm run build:native
  └── Validasi bundel android/app/src/main/assets/public
```

---

## 3. FILE YANG AKAN DIUBAH / DIBUAT

| Target File | Jenis Modifikasi | Alasan Ringkas |
|---|---|---|
| `next.config.ts` | Edit | Menambahkan logika `output: process.env.BUILD_TARGET === 'native' ? 'export' : undefined` |
| `capacitor.config.ts` | Edit | Mengabaikan `server.url` jika dalam mode native production build, mengarahkan `webDir` ke `'out'` |
| `package.json` | Edit | Menambahkan npm scripts: `"build:native": "CROSS_ENV BUILD_TARGET=native next build"` dan `"cap:sync": "npx cap sync android"` |
| `android/.../MainActivity.kt` | Edit | Menghapus pemaksaan `loadUrl("https://agendarecap.vercel.app")`, membiarkan Capacitor memuat bundel lokal |
| `src/lib/sync-engine.ts` | Edit | Mengganti `fetch('/api/reminders')` dengan Direct Supabase SDK JS client |
| `src/store/useReminderStore.ts` | Edit | Mengganti `fetch('/api/reminders')` dengan Direct Supabase SDK JS client |
| `src/store/useStore.ts` | Edit | Mengganti `fetch('/api/agendas')` dengan Direct Supabase SDK JS client |
| `android/.../NotificationActionReceiver.java` | Edit | Menyimpan aksi notifikasi offline (`CLOSE`, `SNOOZE`) ke SharedPreferences Queue |
| `android/.../NativeAlarmPlugin.java` | Edit | Menambahkan plugin method `getPendingNativeActions` & `clearNativeAction` |
| `src/lib/native-alarm.ts` | Edit | Menambahkan bridge TypeScript untuk membaca & menghapus Native Action Queue |
| `src/components/ServiceWorkerRegistration.tsx` | Edit | Menonaktifkan Service Worker PWA di lingkungan Android Native Capacitor |

---

## 4. DEPENDENCIES YANG DIPERLUKAN

- `cross-env` (DevDependency untuk mengatur environment variables cross-platform seperti `BUILD_TARGET=native` di Windows/Linux/macOS).

---

## 5. RISIKO & STRATEGI MITIGASI

1. **Risiko**: Next.js Static Export (`output: 'export'`) error karena adanya fitur dynamic Server Side / Image Optimization.
   - **Mitigasi**: `next.config.ts` sudah memiliki `images: { unoptimized: true }`. Kita memastikan tidak ada `headers()` atau `cookies()` server-only di komponen client Next.js.
2. **Risiko**: Supabase Realtime WebSocket mengonsumsi baterai di background Android.
   - **Mitigasi**: Supabase Realtime hanya diaktifkan saat WebView dalam status `foreground` / `visible`.

---

## 6. TEST MATRIX (MATRIKS PENGUJIAN LENGKAP)

Dokumen `TEST_MATRIX.md` akan mencakup skenario pengujian sebagai berikut:

### A. First Install & Launch Test
- Install APK di Android Emulator / Physical Device.
- Matikan koneksi internet sebelum membuka aplikasi.
- **Ekspektasi**: UI Aplikasi terbuka 100% normal tanpa pesan "Web page not found" atau layar "Mode Offline".

### B. Cold Start & Force Close 10x Test
- Buka aplikasi -> Tutup dari recent apps / Force Stop -> Buka kembali.
- Ulangi sebanyak 10 kali secara berturut-turut.
- **Ekspektasi**: Aplikasi selalu terbuka lancar tanpa crash atau halaman 404.

### C. Offline Creation & Native Alarm Trigger Test
- Matikan WiFi & Mobile Data.
- Buat pengingat baru untuk 2 menit ke depan.
- Force close aplikasi Android.
- **Ekspektasi**: Tepat pada waktunya, Notifikasi Android berbunyi dengan suara alarm & banner melayang.

### D. Offline Interactive Action Sync Test
- Tekan tombol `SNOOZE 5 MIN` atau `SELESAI` pada notifikasi saat hp offline & aplikasi utama mati.
- Nyalakan internet & buka aplikasi AgendaRecap Pro.
- **Ekspektasi**: Aksi yang dilakukan saat offline otomatis tersinkronisasi ke Supabase database.

### E. Reboot Recovery Test
- Buat pengingat untuk 10 menit ke depan.
- Restart perangkat Android (Reboot).
- Tunggu hingga proses booting selesai (tanpa membuka aplikasi).
- **Ekspektasi**: Pengingat tetap berbunyi tepat pada waktunya disetir oleh `BootReceiver` & `AlarmManager`.

### F. Multi-Device Schedule Synchronization Test
- Device A (Web/Device 1): Ubah jam pengingat.
- Device B (Android/Device 2): Saat online, Sync Engine mendeteksi perubahan -> AlarmManager lokal di Device B otomatis di-reschedule sesuai jadwal baru.

### G. Web/PWA Vercel Integrity Test
- Buka `https://agendarecap.vercel.app` di browser Chrome/Edge.
- **Ekspektasi**: Versi Web tetap berjalan 100% normal dengan fitur PWA & Service Worker tanpa ada yang terganggu.
