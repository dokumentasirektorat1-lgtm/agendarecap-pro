import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient } from "@/lib/supabase/client";
import { getRemindersFromIDB, saveRemindersToIDB } from "@/lib/idb";
import { getUTCISOFromLocal, formatLocalFromUTC } from "@/lib/timezone";

export type Frequency = "once" | "daily" | "weekdays" | "weekly";
export type ReminderStatus = "scheduled" | "processing" | "sent" | "snoozed" | "completed" | "dismissed" | "cancelled" | "failed";

export interface Reminder {
  id: string;
  user_id?: string;
  title: string;
  body?: string;
  time: string; // HH:mm format
  scheduledAt: string; // ISO UTC timestamp
  timezone: string; // IANA timezone, e.g. Asia/Jakarta
  status: ReminderStatus;
  snoozedUntil?: string;
  frequency: Frequency;
  isActive: boolean;
  daysOfWeek?: number[];
  sound?: string;
  notificationTag?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

interface ReminderState {
  reminders: Reminder[];
  isLoading: boolean;
  dbSynced: boolean;
  fetchReminders: () => Promise<void>;
  addReminder: (reminder: {
    title: string;
    body?: string;
    time: string;
    scheduledAt?: string;
    timezone?: string;
    frequency?: Frequency;
    sound?: string;
    daysOfWeek?: number[];
  }) => Promise<void>;
  snoozeReminder: (id: string, minutes: number) => Promise<void>;
  updateReminderStatus: (id: string, status: ReminderStatus) => Promise<void>;
  toggleReminder: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      reminders: [],
      isLoading: false,
      dbSynced: false,

      fetchReminders: async () => {
        set({ isLoading: true });

        // 1. Try loading from IndexedDB first for instant UI response
        try {
          const localIdbReminders = await getRemindersFromIDB();
          if (localIdbReminders && localIdbReminders.length > 0) {
            set({ reminders: localIdbReminders as Reminder[] });
          }
        } catch (err) {
          console.warn("[REMINDER] Failed to load IndexedDB reminders:", err);
        }

        // 2. Fetch from Supabase REST API Endpoint
        const supabase = createClient();
        try {
          const { data: { user } } = await supabase.auth.getUser();
          
          const res = await fetch("/api/reminders", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            if (data.reminders && Array.isArray(data.reminders)) {
              const formatted: Reminder[] = data.reminders.map((r: any) => ({
                id: r.id,
                user_id: r.user_id,
                title: r.title,
                body: r.body,
                time: r.time || "08:00",
                scheduledAt: r.scheduled_at || r.createdAt || new Date().toISOString(),
                timezone: r.timezone || "Asia/Jakarta",
                status: r.status || "scheduled",
                snoozedUntil: r.snoozed_until,
                frequency: r.frequency || "once",
                isActive: r.is_active !== undefined ? r.is_active : true,
                daysOfWeek: r.days_of_week,
                sound: r.sound || "default",
                notificationTag: r.notification_tag || `reminder-${r.id}`,
                createdAt: r.created_at || new Date().toISOString(),
                updatedAt: r.updated_at,
                completedAt: r.completed_at
              }));

              set({ reminders: formatted, isLoading: false, dbSynced: true });
              await saveRemindersToIDB(formatted as any);
              return;
            }
          }

          // Fallback direct Supabase client query
          if (user) {
            const { data: remindersTable, error: tableErr } = await supabase
              .from("reminders")
              .select("*")
              .order("scheduled_at", { ascending: true });

            if (!tableErr && remindersTable) {
              const formatted: Reminder[] = remindersTable.map((r: any) => ({
                id: r.id,
                user_id: r.user_id,
                title: r.title,
                body: r.body,
                time: r.time || "08:00",
                scheduledAt: r.scheduled_at || new Date().toISOString(),
                timezone: r.timezone || "Asia/Jakarta",
                status: r.status || "scheduled",
                snoozedUntil: r.snoozed_until,
                frequency: r.frequency || "once",
                isActive: r.is_active !== undefined ? r.is_active : true,
                daysOfWeek: r.days_of_week,
                sound: r.sound || "default",
                notificationTag: r.notification_tag || `reminder-${r.id}`,
                createdAt: r.created_at || new Date().toISOString(),
                updatedAt: r.updated_at,
                completedAt: r.completed_at
              }));

              set({ reminders: formatted, isLoading: false, dbSynced: true });
              await saveRemindersToIDB(formatted as any);
              return;
            }
          }
        } catch (e) {
          console.error("[REMINDER] Failed to fetch reminders from backend server:", e);
        }
        set({ isLoading: false });
      },

      addReminder: async (input) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const userTimezone = input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";

        let scheduledAtISO = input.scheduledAt;
        if (!scheduledAtISO && input.time) {
          const todayStr = now.toISOString().split("T")[0];
          scheduledAtISO = getUTCISOFromLocal(todayStr, input.time, userTimezone);
          // If scheduledAt is in past today, move to tomorrow
          if (new Date(scheduledAtISO).getTime() < now.getTime()) {
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const tomorrowStr = tomorrow.toISOString().split("T")[0];
            scheduledAtISO = getUTCISOFromLocal(tomorrowStr, input.time, userTimezone);
          }
        }

        if (!scheduledAtISO) {
          scheduledAtISO = now.toISOString();
        }

        const scheduledLocalWIB = formatLocalFromUTC(scheduledAtISO, userTimezone);
        console.log(`[REMINDER] Created id=${id}`);
        console.log(`  User Time: ${input.time || 'custom'} (${userTimezone} -> ${scheduledLocalWIB})`);
        console.log(`  Stored UTC: ${scheduledAtISO}`);
        console.log(`  Server Time: ${now.toISOString()}`);
        console.log(`  Scheduled Time: ${scheduledAtISO}`);

        const newReminder: Reminder = {
          id,
          title: input.title,
          body: input.body || `Waktu pengingat Anda (${input.time || 'sekarang'}) telah tiba!`,
          time: input.time || "08:00",
          scheduledAt: scheduledAtISO,
          timezone: userTimezone,
          status: "scheduled",
          frequency: input.frequency || "once",
          isActive: true,
          daysOfWeek: input.daysOfWeek,
          sound: input.sound || "default",
          notificationTag: `reminder-${id}`,
          createdAt: now.toISOString(),
        };

        const updatedList = [...get().reminders, newReminder].sort((a, b) => 
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        );

        // Optimistic Update
        set({ reminders: updatedList });
        await saveRemindersToIDB(updatedList as any);
        console.log(`[REMINDER] Saved id=${id} to IndexedDB`);

        // Server Sync
        try {
          const res = await fetch("/api/reminders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newReminder),
          });
          if (res.ok) {
            set({ dbSynced: true });
            console.log(`[REMINDER] Scheduled id=${id} synced to Supabase DB server`);
          }
        } catch (e) {
          console.error("[REMINDER] Server sync failed for new reminder:", e);
        }
      },

      snoozeReminder: async (id, minutes) => {
        const current = get().reminders.find((r) => r.id === id);
        if (!current) return;

        const now = new Date();
        const snoozeDate = new Date(now.getTime() + minutes * 60 * 1000);
        const snoozeISO = snoozeDate.toISOString();
        const hh = snoozeDate.getHours().toString().padStart(2, "0");
        const mm = snoozeDate.getMinutes().toString().padStart(2, "0");
        const newTime = `${hh}:${mm}`;

        console.log(`[REMINDER] Snoozing id=${id} for +${minutes} minutes -> New Scheduled UTC: ${snoozeISO}`);

        const updatedList = get().reminders.map((r) => {
          if (r.id === id) {
            return {
              ...r,
              scheduledAt: snoozeISO,
              snoozedUntil: snoozeISO,
              status: "snoozed" as ReminderStatus,
              time: newTime,
              isActive: true,
              updatedAt: now.toISOString(),
            };
          }
          return r;
        });

        // Optimistic Update
        set({ reminders: updatedList });
        await saveRemindersToIDB(updatedList as any);

        // Server Sync
        try {
          await fetch(`/api/reminders/${id}/snooze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minutes }),
          });
          set({ dbSynced: true });
          console.log(`[REMINDER] Snooze id=${id} synced to server`);
        } catch (e) {
          console.error("[REMINDER] Failed to sync snooze with backend:", e);
        }
      },

      updateReminderStatus: async (id, status) => {
        const now = new Date().toISOString();
        const updatedList = get().reminders.map((r) => {
          if (r.id === id) {
            return {
              ...r,
              status,
              isActive: status === "scheduled" || status === "snoozed" || status === "processing",
              completedAt: status === "completed" || status === "dismissed" ? now : r.completedAt,
              updatedAt: now,
            };
          }
          return r;
        });

        set({ reminders: updatedList });
        await saveRemindersToIDB(updatedList as any);

        try {
          await fetch(`/api/reminders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
        } catch (e) {
          console.error("[REMINDER] Failed to update status on backend:", e);
        }
      },

      toggleReminder: async (id) => {
        const current = get().reminders.find((r) => r.id === id);
        if (!current) return;
        const newActiveStatus = !current.isActive;
        const newStatus: ReminderStatus = newActiveStatus ? "scheduled" : "cancelled";

        const updatedList = get().reminders.map((r) =>
          r.id === id ? { ...r, isActive: newActiveStatus, status: newStatus } : r
        );

        set({ reminders: updatedList });
        await saveRemindersToIDB(updatedList as any);

        try {
          await fetch(`/api/reminders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: newActiveStatus, status: newStatus }),
          });
        } catch (e) {
          console.error("[REMINDER] Failed to toggle reminder in backend:", e);
        }
      },

      deleteReminder: async (id) => {
        const updatedList = get().reminders.filter((r) => r.id !== id);

        set({ reminders: updatedList });
        await saveRemindersToIDB(updatedList as any);

        try {
          await fetch(`/api/reminders/${id}`, {
            method: "DELETE",
          });
        } catch (e) {
          console.error("[REMINDER] Failed to delete reminder from backend:", e);
        }
      },

      updateReminder: async (id, updates) => {
        const updatedList = get().reminders.map((r) =>
          r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
        );

        set({ reminders: updatedList });
        await saveRemindersToIDB(updatedList as any);

        try {
          await fetch(`/api/reminders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
        } catch (e) {
          console.error("[REMINDER] Failed to update reminder in backend:", e);
        }
      },
    }),
    {
      name: "agendarecap-reminders",
    }
  )
);
