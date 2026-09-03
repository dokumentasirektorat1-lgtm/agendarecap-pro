import { create } from "zustand";
import { persist } from "zustand/middleware";


export type Frequency = "once" | "daily" | "weekdays" | "weekly";

export interface Reminder {
  id: string;
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
  addReminder: (reminder: Omit<Reminder, "id" | "createdAt" | "isActive">) => void;
  toggleReminder: (id: string) => void;
  deleteReminder: (id: string) => void;
  updateReminder: (id: string, updates: Partial<Reminder>) => void;
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set) => ({
      reminders: [],
      addReminder: (reminder) => set((state) => ({
        reminders: [
          ...state.reminders,
          {
            ...reminder,
            id: crypto.randomUUID(),
            isActive: true,
            createdAt: new Date().toISOString()
          }
        ].sort((a, b) => a.time.localeCompare(b.time))
      })),
      toggleReminder: (id) => set((state) => ({
        reminders: state.reminders.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r)
      })),
      deleteReminder: (id) => set((state) => ({
        reminders: state.reminders.filter(r => r.id !== id)
      })),
      updateReminder: (id, updates) => set((state) => ({
        reminders: state.reminders.map(r => r.id === id ? { ...r, ...updates } : r).sort((a, b) => a.time.localeCompare(b.time))
      })),
    }),
    {
      name: "agendarecap-reminders",
    }
  )
);
