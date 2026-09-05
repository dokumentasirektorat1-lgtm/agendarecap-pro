// Offline Sync Engine for Agendaku PWA
// Reconciles local IndexedDB offline queue with Supabase server via Union Merge Strategy

import { getOfflineQueue, removeFromOfflineQueue, getRemindersFromIDB, getOccurrencesFromIDB, saveRemindersToIDB, saveOccurrencesToIDB, IDBReminder, IDBOccurrence } from '@/lib/idb';

let isSyncingInProgress = false;

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
