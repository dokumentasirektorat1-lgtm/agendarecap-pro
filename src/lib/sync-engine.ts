// Offline Sync Engine for Agendaku PWA
// Reconciles local IndexedDB offline queue with Supabase server

import { getOfflineQueue, removeFromOfflineQueue, saveRemindersToIDB, saveOccurrencesToIDB, IDBReminder, IDBOccurrence } from '@/lib/idb';

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

    // 2. Fetch Canonical Dataset from Server (Reconciliation & Cache Replacement)
    const serverRes = await fetch('/api/reminders', { cache: 'no-store' });
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      if (serverData.reminders && Array.isArray(serverData.reminders)) {
        const canonicalReminders: IDBReminder[] = serverData.reminders.map((r: any) => ({
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
        }));

        await saveRemindersToIDB(canonicalReminders);
      }

      if (serverData.occurrences && Array.isArray(serverData.occurrences)) {
        const canonicalOccurrences: IDBOccurrence[] = serverData.occurrences.map((o: any) => ({
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
        }));

        await saveOccurrencesToIDB(canonicalOccurrences);
      }

      console.log('[SYNC] Canonical dataset replaced in IndexedDB successfully.');
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
