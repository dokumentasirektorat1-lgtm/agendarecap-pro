"use client";

import { useEffect } from "react";
import { useReminderStore } from "@/store/useReminderStore";

/**
 * ReminderNotifier — C3.3.3 FINAL
 *
 * Web/PWA reminder delivery is 100% server-driven:
 *   Supabase occurrence → external scheduler → processDueReminders()
 *     → web-push.sendNotification() → public/sw.js push event → OS notification
 *
 * This component is STRICTLY limited to:
 *   1. Service Worker postMessage relay — syncing local store after user acts on
 *      an OS notification (CLOSE → COMPLETE_OCCURRENCE, SNOOZE → SNOOZE_OCCURRENCE).
 *   2. Periodic state refresh — keeping the reminder list UI up to date while
 *      the tab is open (reflects server-updated occurrence statuses).
 *
 * SweetAlert, Swal.fire(), alert(), client-side timer notification, and any
 * in-app popup reminder mechanism are PERMANENTLY REMOVED from this component.
 * There is NO fallback modal regardless of push subscription status.
 *
 * Android delivery uses the native AlarmManager pipeline and is unaffected.
 */
export default function ReminderNotifier() {
  const { fetchReminders, snoozeOccurrence, completeOccurrence } = useReminderStore();

  // Initial data load
  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // ─── Service Worker postMessage relay ────────────────────────────────────────
  // When the user acts on an OS Web Push notification (CLOSE / SNOOZE actions
  // defined in public/sw.js), the SW sends a postMessage to all open clients.
  // We relay those messages into the local Zustand store so the UI stays
  // consistent with the server state that the SW already updated via fetch().
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      if (!event.data) return;
      const { type, reminderId, occurrenceId, minutes } = event.data;

      if (type === "SNOOZE_OCCURRENCE" && reminderId) {
        snoozeOccurrence(reminderId, occurrenceId || "unknown", minutes || 5);
      }
      if (type === "COMPLETE_OCCURRENCE" && reminderId) {
        completeOccurrence(reminderId, occurrenceId || "unknown");
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSWMessage);
    };
  }, [snoozeOccurrence, completeOccurrence]);

  // ─── Periodic UI refresh ─────────────────────────────────────────────────────
  // Poll server state every 60 s while the tab is open so the reminder list
  // reflects occurrence changes made by the scheduler (sent, snoozed, etc.).
  // This is a UI concern only — it does NOT drive notification delivery.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReminders().catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  return null;
}
