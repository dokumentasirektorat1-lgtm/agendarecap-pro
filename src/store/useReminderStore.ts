import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient } from "@/lib/supabase/client";

export type Frequency = "once" | "daily" | "weekdays" | "weekly";

export interface Reminder {
  id: string;
  user_id?: string;
  title: string;
  time: string; // HH:mm format
  frequency: Frequency;
  isActive: boolean;
  daysOfWeek?: number[]; // 0 for Sunday, 1 for Monday, etc. Used if frequency is 'weekly'
  sound?: string; // Options: 'default', 'beep', 'chime'
  createdAt: string;
}

interface ReminderState {
  reminders: Reminder[];
  isLoading: boolean;
  fetchReminders: () => Promise<void>;
  addReminder: (reminder: Omit<Reminder, "id" | "createdAt" | "isActive">) => Promise<void>;
  toggleReminder: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      reminders: [],
      isLoading: false,

      fetchReminders: async () => {
        set({ isLoading: true });
        const supabase = createClient();
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data, error } = await supabase
              .from("reminders")
              .select("*")
              .order("time", { ascending: true });

            if (!error && data) {
              const formatted: Reminder[] = data.map((r: any) => ({
                id: r.id,
                user_id: r.user_id,
                title: r.title,
                time: r.time,
                frequency: r.frequency,
                isActive: r.is_active,
                daysOfWeek: r.days_of_week,
                sound: r.sound,
                createdAt: r.created_at
              }));
              set({ reminders: formatted, isLoading: false });
              return;
            }
          }
        } catch (e) {
          console.error("Failed to fetch reminders from Supabase:", e);
        }
        set({ isLoading: false });
      },

      addReminder: async (reminder) => {
        const newReminder: Reminder = {
          ...reminder,
          id: crypto.randomUUID(),
          isActive: true,
          createdAt: new Date().toISOString()
        };

        // Optimistic local update
        set((state) => ({
          reminders: [...state.reminders, newReminder].sort((a, b) => a.time.localeCompare(b.time))
        }));

        // Supabase DB Sync
        const supabase = createClient();
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("reminders").insert({
              id: newReminder.id,
              user_id: user.id,
              title: newReminder.title,
              time: newReminder.time,
              frequency: newReminder.frequency,
              is_active: newReminder.isActive,
              days_of_week: newReminder.daysOfWeek,
              sound: newReminder.sound
            });
          }
        } catch (e) {
          console.error("Failed to insert reminder into Supabase:", e);
        }
      },

      toggleReminder: async (id) => {
        const current = get().reminders.find(r => r.id === id);
        if (!current) return;
        const newActiveStatus = !current.isActive;

        // Optimistic update
        set((state) => ({
          reminders: state.reminders.map(r => r.id === id ? { ...r, isActive: newActiveStatus } : r)
        }));

        // Supabase DB Sync
        const supabase = createClient();
        try {
          await supabase.from("reminders").update({ is_active: newActiveStatus }).eq("id", id);
        } catch (e) {
          console.error("Failed to toggle reminder in Supabase:", e);
        }
      },

      deleteReminder: async (id) => {
        // Optimistic delete
        set((state) => ({
          reminders: state.reminders.filter(r => r.id !== id)
        }));

        // Supabase DB Sync
        const supabase = createClient();
        try {
          await supabase.from("reminders").delete().eq("id", id);
        } catch (e) {
          console.error("Failed to delete reminder from Supabase:", e);
        }
      },

      updateReminder: async (id, updates) => {
        // Optimistic update
        set((state) => ({
          reminders: state.reminders
            .map(r => r.id === id ? { ...r, ...updates } : r)
            .sort((a, b) => a.time.localeCompare(b.time))
        }));

        // Supabase DB Sync
        const supabase = createClient();
        try {
          const payload: any = {};
          if (updates.title !== undefined) payload.title = updates.title;
          if (updates.time !== undefined) payload.time = updates.time;
          if (updates.frequency !== undefined) payload.frequency = updates.frequency;
          if (updates.isActive !== undefined) payload.is_active = updates.isActive;
          if (updates.daysOfWeek !== undefined) payload.days_of_week = updates.daysOfWeek;
          if (updates.sound !== undefined) payload.sound = updates.sound;

          await supabase.from("reminders").update(payload).eq("id", id);
        } catch (e) {
          console.error("Failed to update reminder in Supabase:", e);
        }
      },
    }),
    {
      name: "agendarecap-reminders",
    }
  )
);
