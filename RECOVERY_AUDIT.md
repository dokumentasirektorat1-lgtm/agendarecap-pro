# RECOVERY AUDIT REPORT - AgendaRecap Pro

**Tanggal Audit:** 8 September 2026  
**Project:** AgendaRecap Pro (Web / PWA & Supabase Integration)  
**Status Audit:** Completed (Phase 1)

---

## A. Auth Architecture
* **Kondisi Saat Ini:**
  * Component `ClientAuthGuard.tsx` dibungkus di level `RootLayout` (`src/app/layout.tsx`). Component ini memeriksa `supabase.auth.getSession()` dan mendengarkan event `onAuthStateChange`.
  * Saat `authLoading` bernilai `true`, aplikasi menampilkan loading screen (*"Memeriksa sesi otentikasi..."*).
  * Pada `src/app/login/actions.ts`, fungsi `login` memanggil `supabase.auth.signInWithPassword()`, namun langsung melakukan `window.location.href = "/"` tanpa memverifikasi ketersediaan `session` via `getSession()`.
  * `src/proxy.ts` (Next.js server proxy) menggunakan `@supabase/ssr` berbasis cookie server, yang berbenturan dengan otentikasi browser berbasis `localStorage` pada Web/PWA static export.
* **Masalah / Vulnerabilities:**
  * **Race condition saat login:** Redirect instan sebelum session tersimpan di browser `localStorage` menyebabkan `ClientAuthGuard` membaca `session = null` dan mengembalikan user ke `/login`.
  * **Split-brain Auth Client:** Penggunaan `@supabase/ssr` (cookie) bersamaan dengan `@supabase/supabase-js` (`localStorage`) menyebabkan hilangnya session saat browser di-refresh.

---

## B. Supabase Client Architecture
* **Kondisi Saat Ini:**
  * `src/lib/supabase/client.ts` bercabang antara `createBrowserClient` (`@supabase/ssr`) untuk Web/PWA dan `createClient` (`@supabase/supabase-js`) untuk Capacitor Native.
  * `src/lib/supabase/server.ts` dan `src/proxy.ts` menggunakan `createServerClient` (`@supabase/ssr`).
* **Masalah / Vulnerabilities:**
  * Pencampuran package SSR (cookie-based) dan JS client (localStorage-based) memicu inkonsistensi token.
  * **Solusi:** Menyeragamkan seluruh Supabase client pada Web/PWA menggunakan **SATU** instance `@supabase/supabase-js` `createClient()` dengan konfigurasi:
    ```ts
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
    ```

---

## C. Agenda Database & RLS
* **Kondisi Saat Ini:**
  * Tabel database Supabase: `agendas` dengan atribut: `id`, `user_id`, `title`, `location`, `notes`, `scheduled_at`, `privateNotes`, `is_completed`, `include_notes_in_share`, `status`, `isShareable`, `groupId`, `isOnline`, `onlineLink`, `meetingId`, `meetingPasscode`, `isUrgent`, `created_at`, `updated_at`.
  * Policy Row Level Security (RLS) aktif dengan aturan `auth.uid() = user_id`.
  * Utility `sanitizer.ts` (`sanitizeAgendaForSupabase`) menyaring atribut UI agar tidak terjadi error SQL *unknown column*.
* **Masalah / Vulnerabilities:**
  * Ketika `user` bernilai `null` (misal saat offline atau saat sesi belum dimuat), query Supabase yang menyertakan `user_id = undefined` ditolak oleh RLS dan tertangkap secara silent, mengembalikan array kosong (`agendas = []`) sehingga database tampak hilang/kosong.

---

## D. IndexedDB (Local-First Engine)
* **Kondisi Saat Ini:**
  * `src/lib/idb.ts` menggunakan IndexedDB v3 (`agendaku_pwa_db`) dengan store: `agendas`, `reminders`, `occurrences`, `offline_queue`, `app_state`.
  * `useStore.ts` menerapkan Local-First: data dibaca secara instan dari IndexedDB via `agendaRepository.getLocal()`, sehingga UI langsung dirender tanpa menunggu jaringan.
* **Masalah / Vulnerabilities:**
  * Pada *fresh install* (IndexedDB kosong), `getLocal()` menghasilkan `[]`. Jika Supabase belum selesai menyinkronkan data atau terjadi error otentikasi, UI menampilkan state kosong tanpa indikasi error yang jelas.

---

## E. Sync & Offline Queue
* **Kondisi Saat Ini:**
  * `syncRepository.ts` memproses antrean mutasi offline (`offline_queue`).
  * Mutasi dieksekusi ke Supabase dan dihapus dari antrean jika berhasil.
  * Mekanisme Last-Write-Wins (LWW) berdasarkan `updated_at` mencegah penimpaan data lama.
  * Component `ConnectivityBanner.tsx` dan halaman `/diagnostics` menampilkan status jaringan, status auth, serta jumlah antrean offline.
* **Masalah / Vulnerabilities:**
  * Antrean legacy dari fitur native notification/reminder yang gagal dapat tertahan pada status `FAILED_RETRYABLE`, menyumbat antrean sync agenda core.

---

## F. Date / Calendar Audit
* **Kondisi Saat Ini:**
  * `AddAgendaModal.tsx` menggabungkan `defaultDate` (YYYY-MM-DD) dan `time` (HH:mm) menjadi object `Date` lokal lalu mengonversinya ke ISO String (`.toISOString()`).
  * `Dashboard` (`page.tsx`) memfilter agenda harian menggunakan `isSameDay(new Date(a.scheduled_at), selectedDate)`.
  * `MonthlyCalendarView.tsx` menggunakan `date-fns` `isSameDay` untuk drag-and-drop agenda.
  * `Calendar.tsx` menggunakan `react-day-picker` v9 dengan styling dark kustom (`calendar.css`).
* **Masalah / Vulnerabilities:**
  * Potensi pergeseran jam/tanggal jika string ISO hasil `.toISOString()` dibaca kembali tanpa memperhatikan zona waktu lokal browser (misal WIB UTC+7).

---

## G. Native / Capacitor Decoupling
* **Kondisi Saat Ini:**
  * Terdapat referensi Capacitor dan Native Alarm (`native-alarm.ts`, `@capacitor/local-notifications`, dll).
* **Solusi Decoupling:**
  * Lepaskan fitur native alarm/push notification dari jalur eksekusi utama Web/PWA.
  * Native alarm/notification error TIDAK BOLEH menggagalkan render Dashboard, otentikasi, maupun sinkronisasi agenda Supabase.

---

## H. Root Causes Breakdown
1. **Redirect Login Terburu-buru:** Login page mengalihkan halaman sebelum `session` benar-benar terverifikasi dan tersimpan di `localStorage`, mengakibatkan loop ke `/login`.
2. **Supabase Client Inconsistency:** Pencampuran `@supabase/ssr` dan `@supabase/supabase-js` membuat session hilang saat browser di-refresh.
3. **Error RLS Disamarkan:** Query gagal akibat hilangnya session/token disamarkan menjadi array kosong (`[]`), sehingga agenda tampak tidak muncul.
4. **Queue Tersumbat Fitur Native:** Kegagalan antrean reminder native menyumbat sinkronisasi agenda lokal ke Supabase.

---

## I. Proposed Fixes & Implementation Plan
1. **Phase 2 & 5 — Supabase Client & Auth Consolidation:**
   * Sederhanakan `src/lib/supabase/client.ts` menggunakan satu instance `@supabase/supabase-js` dengan `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`.
   * Di `login/actions.ts`, pastikan `getSession()` memverifikasi adanya session sebelum redirect.
2. **Phase 3 — Auth Guard Reinforcement:**
   * Pastikan `ClientAuthGuard.tsx` tidak pernah merender Dashboard saat status auth masih `loading` atau `unauthenticated`.
3. **Phase 6 & 7 — Direct Supabase Query & Mapper Integrity:**
   * Pastikan query agenda membaca langsung dari Supabase JS client menggunakan `user.id` terverifikasi.
4. **Phase 8, 9, 10 — Local-First, Offline & Sync Hardening:**
   * Pastikan antrean sync `offline_queue` memisahkan entitas `agenda` dari entitas native reminder yang gagal.
5. **Phase 12 & 13 — Calendar & Dashboard Polish:**
   * Perbaiki parsing tanggal agar konsisten pada zona waktu lokal.
   * Pastikan error Supabase ditampilkan dengan tombol [Coba Lagi], bukan disamarkan sebagai agenda kosong.
6. **Phase 16 — Diagnostics Dashboard:**
   * Sediakan halaman `/diagnostics` yang lengkap dengan informasi Environment, Network, Supabase, Auth, User ID, Session, IndexedDB, Agenda counts, Queue status, serta tombol test.
