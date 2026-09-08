# PHASE 3.2 — AUTH & DATA SYNC HARDENING REPORT

## 1. Root Cause Summary
- **Capacitor Native Auth Loss**: `@supabase/ssr` `createBrowserClient()` relied on browser cookie storage (`document.cookie`), which fails to persist or restore sessions across native Android WebView process reloads.
- **RLS Rejection (`42501`)**: `supabase.auth.getUser()` returned `null`, causing local items to be created with `user_id = undefined` and enqueued into `offline_queue`. When `SyncRepository` attempted upsert queries to Supabase PostgreSQL, RLS policies (`auth.uid() = user_id`) rejected the requests.
- **Remote Pull Bypass**: Remote fetching logic checked `if (user)`, which evaluated to `false`, skipping remote data download.

---

## 2. Files Changed & Implementation Details

1. **`src/lib/supabase/client.ts`**:
   - Implemented a hybrid client factory supporting Web/PWA (SSR cookie client) and Capacitor Native Android (`@supabase/supabase-js` `createClient` bound to `window.localStorage` with `persistSession: true` and `autoRefreshToken: true`).
   - Caching added to guarantee a singleton Supabase client instance across all repositories.

2. **`src/lib/idb.ts`**:
   - Added `repairOrphanDataAndQueueInIDB(userId)`: Scans IndexedDB objectStores (`agendas`, `reminders`, `occurrences`, `offline_queue`), updates unassigned items (`user_id = undefined`) with active `user.id`, and resets failed queue item statuses (`FAILED_RETRYABLE`, `FAILED_FATAL`) back to `PENDING` for queue replay.
   - Added `getOfflineQueueDebugInfo()`: Exposes detailed queue metrics (`pending`, `failedRetryable`, `failedFatal`).

3. **`src/lib/repositories/sync-repository.ts`**:
   - Added single-flight promise guard (`activeSyncPromise`) to prevent duplicate concurrent sync operations.
   - Integrated `repairOrphanDataAndQueueInIDB(user.id)` execution upon obtaining an authenticated session prior to queue processing.
   - Added explicit user filtering (`.eq('user_id', user.id)`) on remote queries for `agendas`, `reminders`, and `reminder_occurrences`.
   - Enhanced query rejection logging (`code`, `message`, `details`, `hint`).

4. **`src/lib/sync-engine.ts`**:
   - Registered global `supabase.auth.onAuthStateChange` listener (`INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`) to automatically trigger `runSyncEngine()`.
   - Registered Capacitor `App.addListener('appStateChange', ({ isActive }) => ...)` to trigger `runSyncEngine()` when the Android app resumes from background.
   - Added single initialization guard (`isListenersInitialized`).

5. **`src/app/diagnostics/page.tsx`**:
   - Added Supabase Auth Session diagnostic card displaying active `user.id`.
   - Added Offline Sync Queue status card breaking down `Pending`, `Retryable`, and `Fatal` item counts.
   - Added manual "Trigger Sync" action button.

---

## 3. Web & Native Build Verification

- **Web Build (`npm run build`)**: **SUCCESS (Exit Code 0)**
- **Native Static Export (`npm run build:native`)**: **SUCCESS (Exit Code 0)**
- **Capacitor Android Sync (`npx cap sync android`)**: **SUCCESS**
- **Android APK Compilation (`gradlew assembleDebug`)**: **SUCCESS (`android/app/build/outputs/apk/debug/app-debug.apk`, 81.9 MB)**

---

## 4. Final Acceptance Criteria Matrix

| Criteria | Code / Build Verification | Device Runtime Status | Overall Status |
|---|---|---|---|
| Native Supabase Session Persistence | **VERIFIED** (`localStorage` client engine) | Pending Device Test | **PASS WITH CODE** |
| Session Restoration on App Restart | **VERIFIED** (`persistSession: true`) | Pending Device Test | **PASS WITH CODE** |
| `getUser()` Returns Valid User | **VERIFIED** (Hybrid factory) | Pending Device Test | **PASS WITH CODE** |
| Agenda Local Write & Sync | **VERIFIED** (Queue + Sanitizer) | Pending Device Test | **PASS WITH CODE** |
| Reminder Local Write & Sync | **VERIFIED** (Queue + Sanitizer) | Pending Device Test | **PASS WITH CODE** |
| Remote Agenda & Reminder Pull | **VERIFIED** (`.eq('user_id', user.id)`) | Pending Device Test | **PASS WITH CODE** |
| Orphan Data & Queue Recovery | **VERIFIED** (`repairOrphanDataAndQueueInIDB`) | Pending Device Test | **PASS WITH CODE** |
| RLS Remains Enabled | **VERIFIED** (No RLS bypass) | Pending Device Test | **PASS WITH CODE** |
| Single-Flight Sync Race Protection | **VERIFIED** (`activeSyncPromise`) | Pending Device Test | **PASS WITH CODE** |
| Capacitor Resume Sync Trigger | **VERIFIED** (`App.addListener('appStateChange')`) | Pending Device Test | **PASS WITH CODE** |
| Web / PWA Compatibility | **VERIFIED** (`npm run build` PASS) | Pending Device Test | **PASS WITH CODE** |
| Android APK Build | **VERIFIED** (`app-debug.apk` built) | **PASS** | **PASS** |

---

## 5. FINAL STATUS

```text
FINAL STATUS:
PASS WITH CODE / NOT DEVICE VERIFIED
```
*(Source code implementation and APK compilation completed successfully. On-device physical runtime test requested for final device verification).*
