# PHASE 2 FINAL EVIDENCE

## A. Agenda Local Persistence

**Status**: PASS

### Evidence:
- **Code Trace**:
  - `READ`: `useStore.fetchAgendas()` calls `agendaRepository.getLocal()`, which executes `getAgendasFromIDB()` in `src/lib/idb.ts`. Data is retrieved from IndexedDB store `agendas` and populated into Zustand state.
  - `CREATE`: `useStore.addAgenda()` calls `agendaRepository.create()`, which writes to IndexedDB via `updateSingleAgendaInIDB()` and enqueues to `offline_queue` via `addToOfflineQueue()`.
  - `UPDATE`: `useStore.updateAgenda()` and `toggleComplete()` call `agendaRepository.update()`, which updates IndexedDB via `updateSingleAgendaInIDB()` and enqueues `UPDATE` mutation to `offline_queue`.
  - `DELETE`: `useStore.deleteAgenda()` calls `agendaRepository.delete()`, which removes record from IndexedDB via `deleteAgendaFromIDB()` and enqueues `DELETE` mutation to `offline_queue`.
- **`/api/agendas` Dependency Audit**:
  - `useStore.ts` contains **ZERO** remaining `fetch('/api/agendas')` calls.
  - `agenda-repository.ts` contains **ZERO** `fetch('/api/agendas')` calls.
  - Agenda storage is strictly Local-First in IndexedDB.

---

## B. Reminder Local Persistence

**Status**: PASS

### Evidence:
- **Code Trace**:
  - `READ`: `useReminderStore.fetchReminders()` calls `reminderRepository.getLocalReminders()` & `getLocalOccurrences()`, reading directly from IndexedDB stores `reminders` and `occurrences`.
  - `CREATE`: `useReminderStore.addReminder()` calls `reminderRepository.create()`, which executes `updateSingleReminderInIDB()` and `updateOccurrenceInIDB()`, enqueues to `offline_queue`, and triggers native local alarm if running on native platform.
  - `UPDATE` / `SNOOZE` / `COMPLETE` / `DELETE`: All action handlers in `useReminderStore.ts` execute local IndexedDB operations via `reminderRepository` before background sync.

---

## C. Offline Queue

**Status**: PASS

### Evidence:
- **Storage**: Persisted in IndexedDB `agendaku_pwa_db` under object store `offline_queue` (KeyPath: `id`).
- **Item Structure Verification (`src/lib/idb.ts`)**:
  - `id`: Client-generated unique ID (`q_${now}_${random}`)
  - `entity_type`: `'agenda' | 'reminder' | 'occurrence'`
  - `entity_id`: Target entity primary key UUID
  - `operation`: `'CREATE' | 'UPDATE' | 'DELETE' | 'SNOOZE' | 'COMPLETE' | 'DISMISS'`
  - `payload`: Object containing mutation attributes
  - `created_at`: Timestamp (ms)
  - `retry_count`: Incremented per failed attempt
  - `status`: `'PENDING' | 'SYNCING' | 'FAILED_RETRYABLE' | 'FAILED_FATAL'`
- **Persistence Across Sessions**: IndexedDB data is persistent across browser refreshes, WebView restarts, process restarts, and device reboots.

---

## D. Supabase Direct Sync

**Status**: PASS

### Evidence:
- **Implementation**: `SyncRepository.runSync()` in `src/lib/repositories/sync-repository.ts`.
- **Direct SDK Operations**:
  - `agenda CREATE/UPDATE`: `supabase.from('agendas').upsert(item.payload)`
  - `agenda DELETE`: `supabase.from('agendas').delete().eq('id', item.entity_id)`
  - `reminder CREATE`: `supabase.from('reminders').upsert(...)` & `supabase.from('reminder_occurrences').upsert(...)`
  - `reminder UPDATE`: `supabase.from('reminders').update(...).eq('id', item.entity_id)`
  - `reminder DELETE`: `supabase.from('reminders').delete().eq('id', item.entity_id)`
  - `occurrence SNOOZE`: `supabase.from('reminder_occurrences').update({ status: 'snoozed', snoozed_until: ... }).eq('id', item.entity_id)`
  - `occurrence COMPLETE`: `supabase.from('reminder_occurrences').update({ status: 'completed', completed_at: ... }).eq('id', item.entity_id)`
- **Removal Policy**: Queue items are removed via `removeFromOfflineQueue(item.id)` **ONLY** after Supabase SDK call returns success (`error == null`). On network error, items remain in queue and `retry_count` is incremented.

---

## E. Native `/api` Dependency

**Status**: PASS WITH ISSUES

### Categorized `/api/` References in Codebase:

1. **SERVER ONLY (Required for Web / Cron)**:
   - `src/app/api/agendas/route.ts` & `[id]/route.ts`: Web backend API routes.
   - `src/app/api/reminders/route.ts`, `[id]/route.ts`, `[id]/snooze/route.ts`: Web backend API routes.
   - `src/app/api/push/...`, `cron/...`, `dev/...`: Server-side Web Push and Cron background workers.

2. **NATIVE SAFE (Fallback / Optional)**:
   - `src/lib/repositories/sync-repository.ts`: Function `processLegacyQueueItem()` contains fallback `fetch('/api/reminders', ...)` for handling legacy queue payloads. (Native primary flow uses `supabase.from(...)`).
   - `src/components/DynamicBranding.tsx`: UI component fetching dynamic branding settings if online.
   - `src/app/diagnostics/page.tsx` & `src/app/settings/notifications/page.tsx`: Diagnostic tools.

3. **NATIVE UNSAFE**:
   - **None detected** in primary native CRUD runtime paths. Native operations communicate directly with IndexedDB and Supabase JS Client.

---

## F. Auth Restoration

**Status**: PASS

### Evidence:
- **Non-Blocking Architecture**:
  - `useStore.fetchAgendas()` and `useReminderStore.fetchReminders()` immediately read local IndexedDB data and set Zustand state before any network or auth check.
  - `isLoading` state is set to `false` immediately following local IndexedDB read.
  - Supabase session check via `supabase.auth.getUser()` runs asynchronously in `syncRepository.runSync()`.
  - If offline or session is expired, local data remains fully rendered and editable in UI.

---

## G. Idempotency

**Status**: PASS WITH ISSUES

### Evidence & Audit:
- **`CREATE` Operations**: Idempotent via UUID primary keys and Postgres `upsert()`. Re-running mutation updates existing record rather than creating duplicate.
- **`UPDATE` Operations**: Idempotent via target primary key (`eq('id', entity_id)` or `upsert()`).
- **`DELETE` Operations**: Idempotent via target primary key (`delete().eq('id', entity_id)`). Re-deleting non-existent record succeeds without side effects.
- **Identified Issue**:
  - In `reminderRepository.update()`, the `payload` passed to `addToOfflineQueue` includes client-only helper attributes (such as `scheduledDate`). If passed directly to `supabase.from('reminders').update(item.payload)`, Supabase will reject the query due to unknown columns if schema does not match.

---

## H. Conflict Resolution

**Status**: PASS WITH ISSUES

### Evidence & Audit:
- **Union Merge (Last Write Wins)**:
  - Implemented in `SyncRepository.runSync()`.
  - Compares remote `updated_at` (TIMESTAMPTZ) with local `updated_at` (ISO string).
  - Remote overwrites local record ONLY if local record does not exist or remote timestamp `>=` local timestamp.
- **Identified Issue**:
  - **Clock Skew Vulnerability**: Local `updated_at` relies on client system time (`new Date().toISOString()`). If a client's device clock is skewed far into the future, client updates will permanently block remote updates from applying until remote server timestamp catches up.

---

## I. Actual Device Verification

**Status**: NOT DEVICE VERIFIED

### Evidence:
- Code-level static analysis, type checks, and build validations (`npm run build` and `npm run build:native`) are verified **PASS**.
- Physical Android device / emulator runtime verification was **NOT** conducted in an active emulator session during this step.

---

## J. Remaining Issues

1. **Unsanitized Payload in Reminder Update Queue**:
   - `reminderRepository.update()` passes raw `updates` (including `scheduledDate`) to `addToOfflineQueue`. Supabase `.update()` might reject unknown column names if not sanitized prior to sync.
2. **Device Clock Skew Sensitivity in LWW Conflict Resolution**:
   - Client timestamp generation (`new Date().toISOString()`) can cause conflict resolution issues if user's device clock is incorrect.
3. **Legacy Queue Fallback Handler**:
   - `SyncRepository.processLegacyQueueItem()` still attempts `fetch('/api/reminders')` if an old legacy item (v1/v2 format) is present in IndexedDB.

---

## K. Files Actually Implementing Phase 2

1. `src/lib/idb.ts`: Upgraded to v3 with `agendas` store and standardized `offline_queue`.
2. `src/lib/repositories/agenda-repository.ts`: Repository for Local-First Agenda CRUD.
3. `src/lib/repositories/reminder-repository.ts`: Repository for Local-First Reminder CRUD.
4. `src/lib/repositories/sync-repository.ts`: Central Sync Engine handling queue replay via Supabase JS Client & Union Merge.
5. `src/store/useStore.ts`: Refactored Agenda Zustand store for local-first operations.
6. `src/store/useReminderStore.ts`: Refactored Reminder Zustand store for local-first operations.
7. `src/lib/sync-engine.ts`: Public wrapper module initializing sync listeners.

---

## FINAL STATUS

**PASS WITH ISSUES**
