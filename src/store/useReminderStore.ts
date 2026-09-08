import { create } from "zustand";
import { persist } from "zustand/middleware";
import { IDBReminder, IDBOccurrence } from "@/lib/idb";
import { reminderRepository } from "@/lib/repositories/reminder-repository";
import { syncRepository } from "@/lib/repositories/sync-repository";
import { isNativePlatform, scheduleNativeLocalAlarm, cancelNativeLocalAlarm } from "@/lib/native-alarm";

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

        try {
          // 1. Instant local IndexedDB load (Local First)
          const localReminders = await reminderRepository.getLocalReminders();
          const localOccurrences = await reminderRepository.getLocalOccurrences();

          const mapped: ReminderItem[] = localReminders.map(r => {
            const activeOcc = localOccurrences.find(o => o.reminderId === r.id && (o.status === 'scheduled' || o.status === 'snoozed' || o.status === 'processing'));
            return {
              ...r,
              currentOccurrence: activeOcc || localOccurrences.filter(o => o.reminderId === r.id).pop()
            };
          });

          set({ reminders: mapped, occurrences: localOccurrences });

          // 2. Background Sync if online
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            await syncRepository.runSync();

            const updatedReminders = await reminderRepository.getLocalReminders();
            const updatedOccurrences = await reminderRepository.getLocalOccurrences();

            const updatedMapped: ReminderItem[] = updatedReminders.map(r => {
              const activeOcc = updatedOccurrences.find(o => o.reminderId === r.id && (o.status === 'scheduled' || o.status === 'snoozed' || o.status === 'processing'));
              return {
                ...r,
                currentOccurrence: activeOcc || updatedOccurrences.filter(o => o.reminderId === r.id).pop()
              };
            });

            set({ reminders: updatedMapped, occurrences: updatedOccurrences, dbSynced: true, isOffline: false });
          } else {
            set({ isOffline: true });
          }
        } catch (err) {
          console.warn('[REMINDER STORE] IndexedDB initial read error:', err);
        } finally {
          set({ isLoading: false });
        }
      },

      addReminder: async (input) => {
        // 1. Local-first Repository Create
        const { reminder, occurrence } = await reminderRepository.create(input);

        // 2. Schedule Native Alarm if on Android
        if (isNativePlatform()) {
          scheduleNativeLocalAlarm({
            reminderId: reminder.id,
            occurrenceId: occurrence.id,
            title: reminder.title,
            body: reminder.body || '',
            sound: reminder.sound || 'default',
            scheduledAt: occurrence.scheduledAt
          });
        }

        // 3. Update UI State immediately
        await get().fetchReminders();

        // 4. Trigger background sync
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncRepository.runSync().catch(e => console.warn('[REMINDER STORE] Sync notice:', e));
        }
      },

      updateReminder: async (id, input) => {
        // 1. Local-first Repository Update
        await reminderRepository.update(id, input);

        // 2. Update UI State
        await get().fetchReminders();

        // 3. Trigger background sync
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncRepository.runSync().catch(e => console.warn('[REMINDER STORE] Sync notice:', e));
        }
      },

      reactivateReminder: async (id) => {
        const target = get().reminders.find(r => r.id === id);
        if (!target) return;

        const res = await reminderRepository.create({
          id: target.id,
          title: target.title,
          body: target.body,
          time: target.time,
          timezone: target.timezone,
          frequency: target.frequency,
          sound: target.sound,
          daysOfWeek: target.daysOfWeek
        });

        if (isNativePlatform()) {
          scheduleNativeLocalAlarm({
            reminderId: res.reminder.id,
            occurrenceId: res.occurrence.id,
            title: res.reminder.title,
            body: res.reminder.body || '',
            sound: res.reminder.sound || 'default',
            scheduledAt: res.occurrence.scheduledAt
          });
        }

        await get().fetchReminders();

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncRepository.runSync().catch(e => console.warn('[REMINDER STORE] Sync notice:', e));
        }
      },

      snoozeOccurrence: async (reminderId, occurrenceId, minutes) => {
        // 1. Local-first Repository Snooze
        const updatedOcc = await reminderRepository.snoozeOccurrence(reminderId, occurrenceId, minutes);

        if (isNativePlatform() && updatedOcc) {
          const targetRem = get().reminders.find(r => r.id === reminderId);
          scheduleNativeLocalAlarm({
            reminderId,
            occurrenceId: updatedOcc.id,
            title: targetRem?.title || 'Pengingat AgendaRecap',
            body: targetRem?.body || '',
            sound: targetRem?.sound || 'default',
            scheduledAt: updatedOcc.snoozedUntil || updatedOcc.scheduledAt
          });
        }

        // 2. Update UI State
        await get().fetchReminders();

        // 3. Background Sync
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncRepository.runSync().catch(e => console.warn('[REMINDER STORE] Sync notice:', e));
        }
      },

      completeOccurrence: async (reminderId, occurrenceId) => {
        // 1. Local-first Repository Complete
        await reminderRepository.completeOccurrence(reminderId, occurrenceId);

        if (isNativePlatform() && occurrenceId) {
          cancelNativeLocalAlarm(occurrenceId);
        }

        // 2. Update UI State
        await get().fetchReminders();

        // 3. Background Sync
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncRepository.runSync().catch(e => console.warn('[REMINDER STORE] Sync notice:', e));
        }
      },

      deleteReminder: async (id) => {
        // 1. Local-first Repository Delete
        await reminderRepository.delete(id);

        // 2. Update UI State
        await get().fetchReminders();

        // 3. Background Sync
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncRepository.runSync().catch(e => console.warn('[REMINDER STORE] Sync notice:', e));
        }
      },

      toggleReminder: async (id) => {
        const target = get().reminders.find(r => r.id === id);
        if (!target) return;

        const occ = target.currentOccurrence;
        const isCurrentlyCompleted = occ?.status === 'completed' || occ?.status === 'dismissed';

        if (!target.isActive || isCurrentlyCompleted) {
          await get().reactivateReminder(id);
          return;
        }

        await reminderRepository.update(id, { isActive: false });
        await get().fetchReminders();

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncRepository.runSync().catch(e => console.warn('[REMINDER STORE] Sync notice:', e));
        }
      },

      triggerSync: async () => {
        await syncRepository.runSync();
        await get().fetchReminders();
      }
    }),
    {
      name: "agendarecap-reminders-v3",
    }
  )
);

// Global Online Listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncRepository.runSync().then(() => useReminderStore.getState().fetchReminders());
  });
}
