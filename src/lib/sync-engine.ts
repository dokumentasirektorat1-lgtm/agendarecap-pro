// Offline Sync Engine for Agendaku PWA
// Reconciles local IndexedDB offline queue with Supabase server via Union Merge Strategy
// Also reconciles Android Native AlarmManager state with active occurrences

import { getOfflineQueue, removeFromOfflineQueue, getRemindersFromIDB, getOccurrencesFromIDB, saveRemindersToIDB, saveOccurrencesToIDB, IDBReminder, IDBOccurrence } from '@/lib/idb';
import { isNativePlatform, getScheduledNativeAlarms, scheduleNativeLocalAlarm, cancelNativeLocalAlarm } from '@/lib/native-alarm';

let isSyncingInProgress = false;

export async function reconcileNativeAlarmsWithIDB(): Promise<{ scheduled: number; cancelled: number }> {
  if (!isNativePlatform()) return { scheduled: 0, cancelled: 0 };

  let scheduled = 0;
  let cancelled = 0;

  try {
    const localOccurrences = await getOccurrencesFromIDB();
    const localReminders = await getRemindersFromIDB();
    const scheduledNativeAlarms = await getScheduledNativeAlarms();

    const nativeAlarmMap = new Map<string, any>();
    scheduledNativeAlarms.forEach((item: any) => {
      if (item && item.occurrenceId) {
        nativeAlarmMap.set(item.occurrenceId, item);
      }
    });

    const activeOccurrencesMap = new Map<string, IDBOccurrence>();

    for (const occ of localOccurrences) {
      const targetTimeStr = occ.snoozedUntil || occ.scheduledAt;
      const targetTimeMs = new Date(targetTimeStr).getTime();
      const nowMs = Date.now();

      if ((occ.status === 'scheduled' || occ.status === 'snoozed') && targetTimeMs > nowMs) {
        activeOccurrencesMap.set(occ.id, occ);

        const nativeItem = nativeAlarmMap.get(occ.id);
        const parentReminder = localReminders.find(r => r.id === occ.reminderId);

        // Missing native alarm or trigger time drifted by > 2 seconds
        if (!nativeItem || !nativeItem.scheduledAtMs || Math.abs(nativeItem.scheduledAtMs - targetTimeMs) > 2000) {
          await scheduleNativeLocalAlarm({
            reminderId: occ.reminderId,
            occurrenceId: occ.id,
            title: parentReminder?.title || 'Pengingat AgendaRecap',
            body: parentReminder?.body || '',
            sound: parentReminder?.sound || 'default',
            scheduledAt: targetTimeStr
          });
          scheduled++;
        }
      } else {
        // Occurrence is completed, dismissed, cancelled, or in the past
        if (nativeAlarmMap.has(occ.id)) {
          await cancelNativeLocalAlarm(occ.id);
          cancelled++;
        }
      }
    }

    // Cancel orphan native alarms that are not in IDB occurrences
    for (const [occurrenceId] of nativeAlarmMap.entries()) {
      if (!activeOccurrencesMap.has(occurrenceId)) {
        await cancelNativeLocalAlarm(occurrenceId);
        cancelled++;
      }
    }

    console.log(`[NATIVE SYNC] Reconciled native alarms: Scheduled=${scheduled}, Cancelled=${cancelled}`);
  } catch (err) {
    console.warn('[NATIVE SYNC] Native alarm reconciliation warning:', err);
  }

  return { scheduled, cancelled };
}

export async function runSyncEngine(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { success: false, syncedCount: 0, errors: ['Device is offline'] };
  }

  if (isSyncingInProgress) {
    return { success: true, syncedCount: 0, errors: ['Sync already in progress'] };
  }

  isSyncingInProgress = true;
  console.log('[SYNC] Offline Sync Engine started...');

  const errors: string[] = [];
  let syncedCount = 0;

  try {
    // 1. Process Offline Queue Mutations
    const queue = await getOfflineQueue();
    console.log(`[SYNC] Pending mutations in offline queue: ${queue.length}`);

    for (const item of queue) {
      try {
        let ok = false;
        if (item.type === 'CREATE_REMINDER') {
          const res = await fetch('/api/reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload)
          });
          ok = res.ok;
        } else if (item.type === 'UPDATE_REMINDER') {
          const res = await fetch(`/api/reminders/${item.payload.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload)
          });
          ok = res.ok;
        } else if (item.type === 'DELETE_REMINDER') {
          const res = await fetch(`/api/reminders/${item.payload.id}`, {
            method: 'DELETE'
          });
          ok = res.ok;
        } else if (item.type === 'SNOOZE_OCCURRENCE') {
          const res = await fetch(`/api/reminders/${item.payload.reminderId}/snooze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes: item.payload.minutes, occurrenceId: item.payload.occurrenceId })
          });
          ok = res.ok;
        } else if (item.type === 'COMPLETE_OCCURRENCE' || item.type === 'DISMISS_OCCURRENCE') {
          const res = await fetch(`/api/reminders/${item.payload.reminderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: item.type === 'COMPLETE_OCCURRENCE' ? 'completed' : 'dismissed', occurrenceId: item.payload.occurrenceId })
          });
          ok = res.ok;
        }

        if (ok) {
          await removeFromOfflineQueue(item.id);
          syncedCount++;
          console.log(`[SYNC] Queue item ${item.id} (${item.type}) synced successfully.`);
        } else {
          console.warn(`[SYNC] Queue item ${item.id} server returned non-200 status.`);
        }
      } catch (err: any) {
        console.error(`[SYNC] Failed to process queue item ${item.id}:`, err);
        errors.push(err.message);
      }
    }

    // 2. Union Merge Strategy with Server Data
    const serverRes = await fetch('/api/reminders', { cache: 'no-store' });
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      const localReminders = await getRemindersFromIDB();
      const localOccurrences = await getOccurrencesFromIDB();

      const reminderMap = new Map<string, IDBReminder>();
      localReminders.forEach(r => reminderMap.set(r.id, r));

      if (serverData.reminders && Array.isArray(serverData.reminders)) {
        serverData.reminders.forEach((r: any) => {
          reminderMap.set(r.id, {
            id: r.id,
            user_id: r.user_id,
            title: r.title,
            body: r.body,
            time: r.time || '08:00',
            timezone: r.timezone || 'Asia/Jakarta',
            frequency: r.frequency || 'once',
            daysOfWeek: r.days_of_week,
            sound: r.sound || 'default',
            isActive: r.is_active !== undefined ? r.is_active : true,
            deliveryMode: r.delivery_mode || 'hybrid',
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at
          });
        });
      }

      const mergedReminders = Array.from(reminderMap.values());
      await saveRemindersToIDB(mergedReminders);

      const occurrenceMap = new Map<string, IDBOccurrence>();
      localOccurrences.forEach(o => occurrenceMap.set(o.id, o));

      if (serverData.occurrences && Array.isArray(serverData.occurrences)) {
        serverData.occurrences.forEach((o: any) => {
          occurrenceMap.set(o.id, {
            id: o.id,
            reminderId: o.reminder_id,
            user_id: o.user_id,
            scheduledAt: o.scheduled_at,
            status: o.status,
            snoozedUntil: o.snoozed_until,
            sentAt: o.sent_at,
            completedAt: o.completed_at,
            dismissedAt: o.dismissed_at,
            notificationTag: o.notification_tag || `reminder-${o.reminder_id}-occurrence-${o.id}`,
            createdAt: o.created_at,
            updatedAt: o.updated_at
          });
        });
      }

      const mergedOccurrences = Array.from(occurrenceMap.values());
      await saveOccurrencesToIDB(mergedOccurrences);

      console.log(`[SYNC] Reconciliation complete: Total Reminders=${mergedReminders.length}, Total Occurrences=${mergedOccurrences.length}`);
    }

    // 3. Reconcile Android Native Alarms with updated IDB state
    await reconcileNativeAlarmsWithIDB();

  } catch (err: any) {
    console.error('[SYNC] Global sync engine error:', err);
    errors.push(err.message);
  } finally {
    isSyncingInProgress = false;
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors
  };
}

// Global Online & Visibility Sync Listeners
export function initSyncEngineListeners() {
  if (typeof window === 'undefined') return;

  const handleOnline = () => {
    console.log('[SYNC] Connection restored -> Triggering Sync Engine');
    runSyncEngine();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      runSyncEngine();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Initial trigger if online
  if (navigator.onLine) {
    runSyncEngine();
  }
}

