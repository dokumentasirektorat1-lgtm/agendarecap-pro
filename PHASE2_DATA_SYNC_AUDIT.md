# PHASE 2 - DATA SYNC & OFFLINE-FIRST ARCHITECTURE AUDIT

## 1. Overview & Data Sources

Currently, the AgendaRecap Pro application has two primary data domains:
1. **Agendas Domain (`agendas`)**: Managed by `useStore.ts`.
   - **Storage**: Supabase Postgres table `public.agendas` via direct JS client OR `/api/agendas` API routes.
   - **Local Storage**: Currently **missing IndexedDB persistence**! `useStore.ts` stores agendas in in-memory React Zustand state. When offline, fetching agendas falls back to `/api/agendas` which fails on native offline client!
2. **Reminders Domain (`reminders` & `reminder_occurrences`)**: Managed by `useReminderStore.ts`.
   - **Storage**: Supabase Postgres tables `public.reminders` & `public.reminder_occurrences` via `/api/reminders` API routes.
   - **Local Storage**: IndexedDB database `agendaku_pwa_db` with stores `reminders`, `occurrences`, `offline_queue`, and `app_state`.

---

## 2. API Endpoints Currently Used
- `GET /api/agendas`, `POST /api/agendas`, `PATCH /api/agendas/[id]`, `DELETE /api/agendas/[id]`
- `GET /api/reminders`, `POST /api/reminders`, `PATCH /api/reminders/[id]`, `DELETE /api/reminders/[id]`, `POST /api/reminders/[id]/snooze`

**Native Offline Vulnerability**:
In native static export (`output: 'export'`), Next.js API routes (`/api/...`) do NOT exist on the client side!
Calling `fetch('/api/reminders')` or `fetch('/api/agendas')` from the native Android app will fail (404 / Connection refused).
Therefore, Native CRUD must use **Local-First (IndexedDB) + Direct Supabase JS Client Sync**.

---

## 3. Current CRUD Operations Analysis

### A. Agendas (`useStore.ts`)
- `fetchAgendas()`: Checks Supabase auth via `createClient()`. If user session is active, queries `supabase.from('agendas')`. If auth fails, falls back to `fetch('/api/agendas')`.
- `addAgenda(agenda)`: Optimistically updates Zustand store, then calls `fetch('/api/agendas', { method: 'POST' })`. Reverts state if server responds with error.
- `toggleComplete(id)`: Optimistically updates Zustand store, then calls `fetch('/api/agendas/${id}', { method: 'PATCH' })`. Reverts on error.
- `updateAgenda(id, updates)`: Optimistically updates Zustand store, then calls `fetch('/api/agendas/${id}', { method: 'PATCH' })`. Reverts on error.
- `deleteAgenda(id)`: Optimistically deletes, then calls `fetch('/api/agendas/${id}', { method: 'DELETE' })`. Reverts on error.

**Gaps Identified**:
1. No IndexedDB cache for agendas! If user opens app offline, `agendas` is empty.
2. Direct dependency on `/api/agendas` POST/PATCH/DELETE endpoints.
3. No offline queue for agendas.

### B. Reminders (`useReminderStore.ts` & `sync-engine.ts`)
- `fetchReminders()`: Reads `reminders` and `occurrences` from IndexedDB. If online, executes `runSyncEngine()` which fetches `/api/reminders` and merges server data with IndexedDB via Union Merge.
- `addReminder(...)`: Writes to Zustand + IndexedDB (`updateSingleReminderInIDB`, `updateOccurrenceInIDB`). If online, posts to `/api/reminders`. If offline/fails, adds `CREATE_REMINDER` to IndexedDB `offline_queue`.
- `updateReminder(...)`, `snoozeOccurrence(...)`, `completeOccurrence(...)`, `deleteReminder(...)`: Optimistically updates Zustand + IndexedDB, attempts fetch to `/api/reminders/...`, and enqueues to `offline_queue` if offline/failed.

**Gaps Identified**:
1. Queue processing in `sync-engine.ts` currently sends HTTP POST/PATCH to `/api/reminders/...`. On native, these relative API endpoints fail!
2. Offline queue items lack status (`status`, `retry_count`, `entity_type`, `operation`).
3. No atomic repository layer separating UI from storage & sync.

---

## 4. IndexedDB Structure (`agendaku_pwa_db` v2)

Currently existing stores:
- `reminders`: keyPath `id`.
- `occurrences`: keyPath `id`, indexes: `reminderId`, `status`, `scheduledAt`.
- `offline_queue`: keyPath `id`.
- `app_state`: keyPath `key`.

**Target Extension (v3)**:
- Add `agendas` store: keyPath `id`, index: `scheduled_at`, `user_id`.
- Upgrade `offline_queue` store to support standardized mutations with `entity_type`, `operation`, `payload`, `retry_count`, `status`.

---

## 5. Supabase Client & RLS Policies Audit

- **Supabase Client**: Initialized in `@/lib/supabase/client` using `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Safe for client bundle.
- **RLS Policies**:
  - `public.agendas`: Enabled RLS (`USING (auth.uid() = user_id)`).
  - `public.reminders` & `public.reminder_occurrences`: Managed via universal access or user RLS policies (`auth.uid() = user_id`).
  - **Admin Client**: `/api/...` routes used `SUPABASE_SERVICE_ROLE_KEY` on backend. On Native, client operations use `NEXT_PUBLIC_SUPABASE_ANON_KEY` combined with active User Auth Session.

---

## 6. Race Conditions & Conflict Resolution Strategy

1. **Initialization Race Condition**:
   State sequence: `IDLE` → `LOCAL_READY` → `AUTH_RESTORING` → `READY` → `SYNCING`.
   UI must immediately render local IndexedDB data on `LOCAL_READY` without waiting for network or session refresh.
2. **Offline Queue Idempotency**:
   Mutations generated offline use client-generated UUIDs (`id`). When synced to Supabase using `.upsert()`, duplicate network requests will update existing records safely instead of creating duplicate entries.
3. **Multi-Device Conflict Resolution**:
   Uses **Last Write Wins (LWW)** based on `updated_at` timestamps. If remote `updated_at` is newer than local timestamp, remote wins; otherwise local mutation is pushed.
