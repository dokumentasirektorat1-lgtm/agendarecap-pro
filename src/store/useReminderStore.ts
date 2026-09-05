import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRemindersFromIDB, getOccurrencesFromIDB, saveRemindersToIDB, saveOccurrencesToIDB, updateSingleReminderInIDB, updateOccurrenceInIDB, deleteReminderFromIDB, addToOfflineQueue, IDBReminder, IDBOccurrence } from "@/lib/idb";
import { runSyncEngine, initSyncEngineListeners } from "@/lib/sync-engine";
import { getUTCISOFromLocal } from "@/lib/timezone";
import { isNativePlatform, scheduleNativeLocalAlarm, cancelNativeLocalAlarm, initNativeAlarmListeners } from "@/lib/native-alarm";

export type Frequency = "once" | "daily" | "weekdays" | "weekly";
export type OccurrenceStatus = "scheduled" | "processing" | "sent" | "snoozed" | "completed" | "dismissed" | "cancelled" | "failed";

export interface ReminderItem {
  id: string;
  user_id?: string;
  title: string;
  body?: string;
  time: string; // HH:mm format
  timezone: string; // e.g. Asia/Jakarta
  frequency: Frequency;
  isActive: boolean;
  daysOfWeek?: number[];
  sound?: string;
  deliveryMode?: 'hybrid' | 'server' | 'local';
  createdAt: string;
  updatedAt?: string;
  // Attached current active occurrence
  currentOccurrence?: IDBOccurrence;
}

interface ReminderStoreState {
  reminders: ReminderItem[];
  occurrences: IDBOccurrence[];
  isLoading: boolean;
  dbSynced: boolean;
  isOffline: boolean;
  fetchReminders: () => Promise<void>;
  addReminder: (input: {
    id?: string;
    title: string;
    body?: string;
    time: string;
    scheduledDate?: string;
    scheduledAt?: string;
    timezone?: string;
    frequency?: Frequency;
    sound?: string;
    daysOfWeek?: number[];
  }) => Promise<void>;
  updateReminder: (id: string, input: {
    title: string;
    body?: string;
    time: string;
    scheduledDate?: string;
    timezone?: string;
    frequency?: Frequency;
    sound?: string;
    daysOfWeek?: number[];
  }) => Promise<void>;
  reactivateReminder: (id: string) => Promise<void>;
  snoozeOccurrence: (reminderId: string, occurrenceId: string, minutes: number) => Promise<void>;
  completeOccurrence: (reminderId: string, occurrenceId: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  toggleReminder: (id: string) => Promise<void>;
  triggerSync: () => Promise<void>;
}

export const useReminderStore = create<ReminderStoreState>()(
  persist(
    (set, get) => ({
      reminders: [],
      occurrences: [],
      isLoading: false,
      dbSynced: false,
      isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,

      fetchReminders: async () => {
        set({ isLoading: true });

        // 1. Instant local IndexedDB load
        try {
          const localReminders = await getRemindersFromIDB();
          const localOccurrences = await getOccurrencesFromIDB();

          const mapped: ReminderItem[] = localReminders.map(r => {
            const activeOcc = localOccurrences.find(o => o.reminderId === r.id && (o.status === 'scheduled' || o.status === 'snoozed' || o.status === 'processing'));
            return {
              ...r,
              currentOccurrence: activeOcc || localOccurrences.filter(o => o.reminderId === r.id).pop()
            };
          });

          set({ reminders: mapped, occurrences: localOccurrences });
        } catch (err) {
          console.warn('[STORE] IndexedDB initial read warning:', err);
        }

        // 2. Network Server Sync with Union Merge Reconciliation
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await runSyncEngine();

            const res = await fetch('/api/reminders', { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              const localReminders = await getRemindersFromIDB();
              const localOccurrences = await getOccurrencesFromIDB();

              const reminderMap = new Map<string, IDBReminder>();
              localReminders.forEach(r => reminderMap.set(r.id, r));

              if (data.reminders && Array.isArray(data.reminders)) {
                data.reminders.forEach((r: any) => {
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

              const occurrenceMap = new Map<string, IDBOccurrence>();
              localOccurrences.forEach(o => occurrenceMap.set(o.id, o));

              if (data.occurrences && Array.isArray(data.occurrences)) {
                data.occurrences.forEach((o: any) => {
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

              const mapped: ReminderItem[] = mergedReminders.map(r => {
                const activeOcc = mergedOccurrences.find(o => o.reminderId === r.id && (o.status === 'scheduled' || o.status === 'snoozed' || o.status === 'processing'));
                return {
                  ...r,
                  currentOccurrence: activeOcc || mergedOccurrences.filter(o => o.reminderId === r.id).pop()
                };
              });

              set({ reminders: mapped, occurrences: mergedOccurrences, dbSynced: true, isOffline: false });
              await saveRemindersToIDB(mergedReminders);
              await saveOccurrencesToIDB(mergedOccurrences);
            }
          } catch (e) {
            console.error('[STORE] Server fetch error:', e);
            set({ dbSynced: false, isOffline: true });
          }
        } else {
          set({ isOffline: true });
        }

        set({ isLoading: false });
      },

      addReminder: async (input) => {
        const reminderId = input.id || crypto.randomUUID();
        const occurrenceId = crypto.randomUUID();
        const now = new Date();
        const userTimezone = input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";

        let scheduledAtISO = input.scheduledAt;
        if (!scheduledAtISO && input.time) {
          const targetDateStr = input.scheduledDate || now.toISOString().split("T")[0];
          scheduledAtISO = getUTCISOFromLocal(targetDateStr, input.time, userTimezone);
          if (new Date(scheduledAtISO).getTime() < now.getTime() && !input.scheduledDate) {
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const tomorrowStr = tomorrow.toISOString().split("T")[0];
            scheduledAtISO = getUTCISOFromLocal(tomorrowStr, input.time, userTimezone);
          }
        }

        if (!scheduledAtISO) scheduledAtISO = now.toISOString();

        const newReminder: IDBReminder = {
          id: reminderId,
          title: input.title.trim(),
          body: input.body || '',
          time: input.time || "08:00",
          timezone: userTimezone,
          frequency: input.frequency || "once",
          daysOfWeek: input.daysOfWeek,
          sound: input.sound || "default",
          isActive: true,
          deliveryMode: 'hybrid',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };

        const newOccurrence: IDBOccurrence = {
          id: occurrenceId,
          reminderId,
          scheduledAt: scheduledAtISO,
          status: "scheduled",
          notificationTag: `reminder-${reminderId}-occurrence-${occurrenceId}`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };

        // 1. Optimistic Local Update
        const filteredReminders = get().reminders.filter(r => r.id !== reminderId);
        const filteredOccs = get().occurrences.filter(o => o.reminderId !== reminderId);

        const updatedOccurrences = [...filteredOccs, newOccurrence];
        const updatedReminders = [...filteredReminders, { ...newReminder, currentOccurrence: newOccurrence }].sort((a, b) => {
          const timeA = a.currentOccurrence?.scheduledAt ? new Date(a.currentOccurrence.scheduledAt).getTime() : 0;
          const timeB = b.currentOccurrence?.scheduledAt ? new Date(b.currentOccurrence.scheduledAt).getTime() : 0;
          return timeA - timeB;
        });

        set({ reminders: updatedReminders, occurrences: updatedOccurrences });
        await updateSingleReminderInIDB(newReminder);
        await updateOccurrenceInIDB(newOccurrence);

        // Schedule Native Android Local Alarm if native platform
        if (isNativePlatform()) {
          scheduleNativeLocalAlarm({
            reminderId,
            occurrenceId,
            title: input.title.trim(),
            body: input.body || '',
            scheduledAt: scheduledAtISO
          });
        }

        // 2. Immediate Server Upload Sync
        const payload = {
          id: reminderId,
          title: input.title.trim(),
          body: input.body || '',
          time: input.time || "08:00",
          scheduledAt: scheduledAtISO,
          timezone: userTimezone,
          frequency: input.frequency || "once",
          sound: input.sound || "default",
          daysOfWeek: input.daysOfWeek
        };

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await fetch('/api/reminders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            set({ dbSynced: true });
          } catch (e) {
            console.warn('[STORE] Server offline -> Adding CREATE_REMINDER to offline queue');
            await addToOfflineQueue({ type: 'CREATE_REMINDER', payload });
          }
        } else {
          await addToOfflineQueue({ type: 'CREATE_REMINDER', payload });
        }
      },

      updateReminder: async (id, input) => {
        const target = get().reminders.find(r => r.id === id);
        if (!target) return;

        const now = new Date();
        const userTimezone = input.timezone || target.timezone || "Asia/Jakarta";

        let scheduledAtISO = target.currentOccurrence?.scheduledAt;
        if (input.time) {
          const targetDateStr = input.scheduledDate || now.toISOString().split("T")[0];
          scheduledAtISO = getUTCISOFromLocal(targetDateStr, input.time, userTimezone);
        }

        const updatedReminderObj: IDBReminder = {
          ...target,
          title: input.title.trim(),
          body: input.body !== undefined ? input.body : target.body,
          time: input.time || target.time,
          timezone: userTimezone,
          frequency: input.frequency || target.frequency,
          daysOfWeek: input.daysOfWeek !== undefined ? input.daysOfWeek : target.daysOfWeek,
          sound: input.sound || target.sound,
          updatedAt: now.toISOString()
        };

        const updatedOccurrences = get().occurrences.map(o => {
          if (o.reminderId === id) {
            return {
              ...o,
              scheduledAt: scheduledAtISO || o.scheduledAt,
              updatedAt: now.toISOString()
            };
          }
          return o;
        });

        const updatedReminders = get().reminders.map(r => {
          if (r.id === id) {
            const activeOcc = updatedOccurrences.find(o => o.reminderId === id);
            return { ...updatedReminderObj, currentOccurrence: activeOcc };
          }
          return r;
        });

        set({ reminders: updatedReminders, occurrences: updatedOccurrences });
        await updateSingleReminderInIDB(updatedReminderObj);

        const activeOccToUpdate = updatedOccurrences.find(o => o.reminderId === id);
        if (activeOccToUpdate) await updateOccurrenceInIDB(activeOccToUpdate);

        // Server Upload
        const payload = {
          id,
          title: input.title.trim(),
          body: input.body,
          time: input.time,
          scheduledAt: scheduledAtISO,
          timezone: userTimezone,
          frequency: input.frequency,
          sound: input.sound,
          daysOfWeek: input.daysOfWeek
        };

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await fetch(`/api/reminders/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } catch (e) {
            await addToOfflineQueue({ type: 'UPDATE_REMINDER', payload });
          }
        } else {
          await addToOfflineQueue({ type: 'UPDATE_REMINDER', payload });
        }
      },

      reactivateReminder: async (id) => {
        const target = get().reminders.find(r => r.id === id);
        if (!target) return;

        const now = new Date();
        const userTimezone = target.timezone || "Asia/Jakarta";
        const todayStr = now.toISOString().split("T")[0];

        // Calculate next upcoming execution time
        let nextScheduledISO = getUTCISOFromLocal(todayStr, target.time || "08:00", userTimezone);
        if (new Date(nextScheduledISO).getTime() <= now.getTime()) {
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const tomorrowStr = tomorrow.toISOString().split("T")[0];
          nextScheduledISO = getUTCISOFromLocal(tomorrowStr, target.time || "08:00", userTimezone);
        }

        const occurrenceId = crypto.randomUUID();
        const newOccurrence: IDBOccurrence = {
          id: occurrenceId,
          reminderId: id,
          scheduledAt: nextScheduledISO,
          status: 'scheduled',
          notificationTag: `reminder-${id}-occurrence-${occurrenceId}`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };

        const updatedReminderObj: IDBReminder = {
          ...target,
          isActive: true,
          updatedAt: now.toISOString()
        };

        // Filter out old completed occurrences for this reminder and attach new active scheduled occurrence
        const filteredOccs = get().occurrences.filter(o => o.reminderId !== id);
        const updatedOccurrences = [...filteredOccs, newOccurrence];

        const updatedReminders = get().reminders.map(r => {
          if (r.id === id) {
            return { ...updatedReminderObj, currentOccurrence: newOccurrence };
          }
          return r;
        });

        set({ reminders: updatedReminders, occurrences: updatedOccurrences });

        await updateSingleReminderInIDB(updatedReminderObj);
        await updateOccurrenceInIDB(newOccurrence);

        if (isNativePlatform()) {
          scheduleNativeLocalAlarm({
            reminderId: id,
            occurrenceId,
            title: target.title,
            body: target.body,
            scheduledAt: nextScheduledISO
          });
        }

        // Upload to server
        const payload = {
          id,
          isActive: true,
          scheduledAt: nextScheduledISO
        };

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await fetch(`/api/reminders/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'scheduled', isActive: true, occurrenceId })
            });

            // Also ensure reminder record is posted if missing
            await fetch('/api/reminders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id,
                title: target.title,
                body: target.body,
                time: target.time,
                scheduledAt: nextScheduledISO,
                timezone: userTimezone,
                frequency: target.frequency
              })
            });
          } catch (e) {
            await addToOfflineQueue({ type: 'UPDATE_REMINDER', payload });
          }
        } else {
          await addToOfflineQueue({ type: 'UPDATE_REMINDER', payload });
        }
      },

      snoozeOccurrence: async (reminderId, occurrenceId, minutes) => {
        const now = new Date();
        const snoozeDate = new Date(now.getTime() + minutes * 60 * 1000);
        const snoozeISO = snoozeDate.toISOString();

        // 1. Optimistic Update
        const updatedOccs = get().occurrences.map(o => {
          if (o.reminderId === reminderId && (o.id === occurrenceId || occurrenceId === 'unknown')) {
            return {
              ...o,
              status: 'snoozed' as OccurrenceStatus,
              snoozedUntil: snoozeISO,
              updatedAt: now.toISOString()
            };
          }
          return o;
        });

        const updatedReminders = get().reminders.map(r => {
          if (r.id === reminderId) {
            const updatedOcc = updatedOccs.find(o => o.reminderId === reminderId);
            return { ...r, currentOccurrence: updatedOcc };
          }
          return r;
        });

        set({ reminders: updatedReminders, occurrences: updatedOccs });

        const occToSave = updatedOccs.find(o => o.reminderId === reminderId);
        if (occToSave) await updateOccurrenceInIDB(occToSave);

        if (isNativePlatform()) {
          const targetRem = get().reminders.find(r => r.id === reminderId);
          scheduleNativeLocalAlarm({
            reminderId,
            occurrenceId: occurrenceId || 'unknown',
            title: targetRem?.title || 'Pengingat AgendaRecap',
            body: targetRem?.body || '',
            scheduledAt: snoozeISO
          });
        }

        // 2. Server Sync or Queue
        const payload = { reminderId, occurrenceId, minutes };
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await fetch(`/api/reminders/${reminderId}/snooze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } catch (e) {
            await addToOfflineQueue({ type: 'SNOOZE_OCCURRENCE', payload });
          }
        } else {
          await addToOfflineQueue({ type: 'SNOOZE_OCCURRENCE', payload });
        }
      },

      completeOccurrence: async (reminderId, occurrenceId) => {
        const nowISO = new Date().toISOString();

        // 1. Optimistic Update
        const updatedOccs = get().occurrences.map(o => {
          if (o.reminderId === reminderId && (o.id === occurrenceId || occurrenceId === 'unknown')) {
            return {
              ...o,
              status: 'completed' as OccurrenceStatus,
              completedAt: nowISO,
              updatedAt: nowISO
            };
          }
          return o;
        });

        const updatedReminders = get().reminders.map(r => {
          if (r.id === reminderId) {
            const updatedOcc = updatedOccs.find(o => o.reminderId === reminderId);
            return { ...r, currentOccurrence: updatedOcc };
          }
          return r;
        });

        set({ reminders: updatedReminders, occurrences: updatedOccs });

        const occToSave = updatedOccs.find(o => o.reminderId === reminderId);
        if (occToSave) await updateOccurrenceInIDB(occToSave);

        if (isNativePlatform() && occurrenceId) {
          cancelNativeLocalAlarm(occurrenceId);
        }

        // 2. Server Sync or Queue
        const payload = { reminderId, occurrenceId, status: 'completed' };
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await fetch(`/api/reminders/${reminderId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } catch (e) {
            await addToOfflineQueue({ type: 'COMPLETE_OCCURRENCE', payload });
          }
        } else {
          await addToOfflineQueue({ type: 'COMPLETE_OCCURRENCE', payload });
        }
      },

      deleteReminder: async (id) => {
        const updatedReminders = get().reminders.filter(r => r.id !== id);
        const updatedOccs = get().occurrences.filter(o => o.reminderId !== id);

        set({ reminders: updatedReminders, occurrences: updatedOccs });
        await deleteReminderFromIDB(id);

        const payload = { id };
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
          } catch (e) {
            await addToOfflineQueue({ type: 'DELETE_REMINDER', payload });
          }
        } else {
          await addToOfflineQueue({ type: 'DELETE_REMINDER', payload });
        }
      },

      toggleReminder: async (id) => {
        const target = get().reminders.find(r => r.id === id);
        if (!target) return;

        const occ = target.currentOccurrence;
        const isCurrentlyCompleted = occ?.status === 'completed' || occ?.status === 'dismissed';

        // If reminder is completed and user toggles it back ON, reactivate it with a new scheduled occurrence
        if (!target.isActive || isCurrentlyCompleted) {
          await get().reactivateReminder(id);
          return;
        }

        // Toggle OFF (Deactivate)
        const newActiveState = false;
        const updatedReminders = get().reminders.map(r => 
          r.id === id ? { ...r, isActive: newActiveState } : r
        );

        set({ reminders: updatedReminders });
        await updateSingleReminderInIDB({ ...target, isActive: newActiveState });

        const payload = { id, isActive: newActiveState };
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            await fetch(`/api/reminders/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } catch (e) {
            await addToOfflineQueue({ type: 'UPDATE_REMINDER', payload });
          }
        } else {
          await addToOfflineQueue({ type: 'UPDATE_REMINDER', payload });
        }
      },

      triggerSync: async () => {
        const res = await runSyncEngine();
        await get().fetchReminders();
        console.log('[STORE] Manual sync completed:', res);
      }
    }),
    {
      name: "agendarecap-reminders-v2",
    }
  )
);

// Initialize sync listeners when module is loaded on client
if (typeof window !== 'undefined') {
  initSyncEngineListeners();
}
