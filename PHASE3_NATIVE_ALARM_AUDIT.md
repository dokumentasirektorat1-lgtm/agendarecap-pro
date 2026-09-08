# PHASE 3 — NATIVE ALARM & NOTIFICATION ENGINE AUDIT

## Executive Summary
Audit of existing native Android implementation (`android/app/src/main/java/com/agendarecap/app/`) and Capacitor bridge (`src/lib/native-alarm.ts`).

---

## 1. Native Component Audit Matrix

| Component | File Path | Current Capability | Identified Gaps / Deficiencies |
|---|---|---|---|
| **Alarm Storage** | `AlarmStorage.java` | Stores scheduled alarms in `SharedPreferences` (`agendarecap_native_alarms`) mapped by `occurrenceId`. | Only stores active alarms. Does not store a native action event queue for offline user responses. |
| **Alarm Receiver** | `AlarmReceiver.java` | Receives `AlarmManager` wake broadcasts, acquires `WAKE_LOCK`, creates `IMPORTANCE_HIGH` channel with custom sound/vibration, builds notification with `CLOSE`, `5 MIN`, `15 MIN` actions. | Works offline, but notification action clicks do not enqueue persistent native actions for JS import. |
| **Action Receiver** | `NotificationActionReceiver.java` | Handles `ACTION_CLOSE` and `ACTION_SNOOZE` broadcast intents when user clicks notification buttons. Cancels/reschedules alarm natively. | **Critical Gap**: Does not write to a persistent `NativeActionQueue`. Event is lost to IndexedDB/Supabase if app is closed when action is clicked. |
| **Boot Receiver** | `BootReceiver.java` | Listens for `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `QUICKBOOT_POWERON`. Reads `AlarmStorage` and re-registers exact alarms with `AlarmManager`. | Fully functional for future alarms. Expired past alarms are removed without queuing missed occurrence notifications. |
| **Plugin Bridge** | `NativeAlarmPlugin.java` | Exposes `schedule`, `cancel`, `snooze`, `cancelAll`, `getScheduled`, `checkPermissions`, `requestExactAlarmPermission` to Capacitor. | Lacks bridge methods to fetch and acknowledge pending native actions (`getPendingNativeActions`, `acknowledgeNativeAction`). |
| **FCM Service** | `FCMService.kt` | Handles background Firebase Cloud Messaging for remote data alerts. | Configured correctly as remote alert worker; not used as alarm timer. |
| **Permissions** | `AndroidManifest.xml` | Declares `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`. | Properly configured for Android 12+ (API 31+) and Android 13+ (API 33+). |

---

## 2. Identified Engineering Goals for Phase 3 Implementation

1. **Persistent Native Action Queue (`NativeActionStorage.java`)**:
   - Create a dedicated `SharedPreferences` store (`agendarecap_native_actions`) to queue user action events (`COMPLETE`, `SNOOZE_5`, `SNOOZE_15`, `DISMISS`) pressed via native notification action buttons.
2. **Native Bridge Extension (`NativeAlarmPlugin.java` & `native-alarm.ts`)**:
   - Add plugin methods: `getPendingNativeActions()` and `acknowledgeNativeAction(actionId)`.
3. **JS Import & Synchronization Engine Integration (`src/lib/native-alarm-sync.ts`)**:
   - On app startup and resume, import pending native actions into `ReminderRepository` -> IndexedDB `offline_queue` -> `SyncRepository` -> Supabase.
4. **Deterministic Alarm ID & Single Next Occurrence Strategy**:
   - Ensure alarm IDs use deterministic `Math.abs(occurrenceId.hashCode())` hash strategy.
5. **Multi-device & Idempotent Reconciliation**:
   - Ensure `reconcileNativeAlarmsWithIDB()` in JS layer handles background syncing without creating duplicate alarms or resurrecting cancelled alarms.
