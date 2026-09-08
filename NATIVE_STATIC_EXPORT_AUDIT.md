# NATIVE STATIC EXPORT AUDIT - AgendaRecap Pro

**Tanggal Audit:** 8 September 2026  
**Fokus:** Evaluasi Kompatibilitas Static Export (`output: 'export'`) untuk Capacitor Android Native  

---

## 1. FITUR YANG KOMPATIBEL UNTUK STATIC EXPORT

1. **Client Components (`"use client"`)**:
   - Hampir seluruh halaman UI utama (`src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/consultation/page.tsx`, `src/app/diagnostics/page.tsx`, `src/app/settings/page.tsx`, `src/app/waiting-approval/page.tsx`, `src/app/admin/page.tsx`) dideklarasikan sebagai `"use client"`.
   - Menggunakan React hooks (`useState`, `useEffect`), Framer Motion, Lucide Icons, dan Zustand stores (`useStore`, `useReminderStore`). Semua ini 100% kompatibel dengan static export Next.js.
2. **Client-Side Supabase SDK (`@supabase/supabase-js`)**:
   - Client client `createClient()` dari `@/lib/supabase/client.ts` bekerja secara penuh di browser/WebView tanpa memerlukan Node.js runtime.
3. **Penyimpanan Lokal & Native Bridge**:
   - IndexedDB (`idb.ts`) dan Capacitor Plugins (`@capacitor/core`, `NativeAlarmPlugin`) bekerja penuh di browser/WebView.
4. **Konfigurasi Gambar**:
   - `next.config.ts` sudah dikonfigurasi dengan `images: { unoptimized: true }`, yang merupakan syarat wajib Next.js static export.

---

## 2. FITUR YANG TIDAK KOMPATIBEL / SERVER-ONLY

1. **Server Actions (`"use server"`)**:
   - File terdampak:
     - `src/app/login/actions.ts` (`login`, `signup`, `logout`)
     - `src/app/actions/agenda.ts` (`getAgendasByMonth`, `getAgendasByDate`, `updateAgenda`)
     - `src/app/actions/admin.ts` (`approveUser`, `rejectUser`, `getProfiles`)
     - `src/app/actions/settings.ts` (`getSettings`, `updateSettings`)
   - *Masalah*: Next.js static export (`output: 'export'`) tidak mendukung Server Actions karena memerlukan server Next.js yang menangani request `POST`.
2. **Next.js Proxy / Middleware (`src/proxy.ts`)**:
   - *Masalah*: `proxy.ts` menggunakan `@supabase/ssr` (`createServerClient`) dengan `cookies()` dari `next/server` untuk memeriksa otentikasi di tingkat server HTTP. Static export di Android WebView tidak memiliki HTTP server runtime.
3. **Server-Side API Routes (`src/app/api/...`)**:
   - File terdampak:
     - `src/app/api/agendas/...`
     - `src/app/api/reminders/...`
     - `src/app/api/cron/...`
     - `src/app/api/push/...`
   - *Masalah*: Endpoint `/api/...` tidak diekspor ke file HTML/JS statis oleh `output: 'export'`.
4. **Supabase Server Client (`@/lib/supabase/server.ts`)**:
   - Menggunakan `cookies()` dari `next/headers`, yang tidak tersedia di lingkungan static export.

---

## 3. AUDIT KEBUTUHAN UI UTAMA & SOLUSI AMAN UNTUK NATIVE

| Komponen / Fitur | Apakah Diperlukan oleh UI Utama Native? | Solusi Aman untuk Native (Capacitor) | Apakah Mengubah Perilaku Web/Vercel? |
|---|---|---|---|
| **Otentikasi Login/Signup** | **Ya** | Pada versi Native, panggilan otentikasi dapat menggunakan Supabase Client SDK (`supabase.auth.signInWithPassword`, `signUp`) secara langsung di client component tanpa memanggil Server Action. Pada Web/Vercel, Server Action tetap bekerja. | **Tidak**. Web/Vercel tetap menggunakan Server Actions/SSR jika diinginkan, sementara Native menggunakan Client SDK. |
| **Pemeriksaan Otorisasi / Route Protection** | **Ya** | `proxy.ts` diabaikan pada static export. Proteksi halaman pada versi Native ditangani di tingkat client (`useEffect` / Zustand store memeriksa `supabase.auth.getUser()`). | **Tidak**. `proxy.ts` tetap aktif saat di-deploy ke Vercel. |
| **API Routes & Cron Jobs** | **Tidak di Native** (Hanya di Web/Vercel) | Cron jobs (`/api/cron/...`) dan Web Push server (`/api/push/...`) tetap berjalan di Vercel. Native Android menggunakan Direct Supabase SDK dan native `AlarmManager`. | **Tidak**. Vercel build (`BUILD_TARGET=web`) memuat seluruh API routes. |

---

## 4. KESIMPULAN AUDIT & KEAMANAN STATIC EXPORT

* **Static Export aman diterapkan untuk Native Build (`BUILD_TARGET=native`)**:
  - Dengan mengisolasikan `output: 'export'` hanya ketika `BUILD_TARGET=native`, aplikasi web yang berjalan di Vercel (`BUILD_TARGET=web` atau tanpa flag) **TIDAK TERDAMPAK SAMA SEKALI** dan tetap memiliki akses ke Server Actions, Proxy Middleware, API Routes, dan Vercel Cron.
  - Untuk Native Build, bundel `out/` akan berisi seluruh aset React/Next.js statis yang dibutuhkan oleh Capacitor Android untuk membuka UI secara penuh 100% offline.
