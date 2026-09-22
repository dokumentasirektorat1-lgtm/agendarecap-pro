"use client";

import { useEffect, useRef } from "react";
import { useReminderStore } from "@/store/useReminderStore";

/**
 * ReminderNotifier — C3.3.2 HARDENED
 *
 * Primary reminder delivery for Web/PWA: Web Push (server-driven via external scheduler).
 * This component now handles ONLY:
 *   1. Listening to Service Worker postMessage events (SNOOZE / COMPLETE from notification actions)
 *      and syncing those actions into local state.
 *   2. In-tab audio cue when a reminder fires locally (no popup — Web Push handles the OS notification).
 *   3. Triggering a state refresh so the UI reflects updated occurrence status after a Web Push action.
 *
 * SweetAlert / in-app modal popups are suppressed if the browser has an active Web Push subscription.
 * This prevents duplicate notifications when server-driven push is the active delivery channel.
 *
 * NOTE: Do NOT use this component as the primary notification mechanism.
 * The full delivery chain is: Supabase occurrence → external scheduler → processDueReminders()
 *   → web-push.sendNotification() → public/sw.js push event → OS notification.
 */

function playSound(type: string) {
  if (type === 'default' || !type) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'beep') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === 'chime') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.6);
      osc2.stop(ctx.currentTime + 1.6);
    }
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}

/** Returns true if the browser currently has an active Web Push subscription. */
async function hasActivePushSubscription(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !reg.pushManager) return false;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

export default function ReminderNotifier() {
  const { reminders, occurrences, fetchReminders, snoozeOccurrence, completeOccurrence } = useReminderStore();
  // Track whether a Web Push subscription is active so we can suppress duplicate in-app modals
  const hasPushSubRef = useRef<boolean | null>(null);

  useEffect(() => {
    fetchReminders();
    // Probe subscription status once on mount (async — result cached in ref)
    hasActivePushSubscription().then(v => { hasPushSubRef.current = v; });
  }, [fetchReminders]);

  // ─── Service Worker message relay ───────────────────────────────────────────
  // When the user taps CLOSE or SNOOZE on an OS notification, the SW fires a
  // postMessage event. We catch it here to keep local store state in sync with
  // server state updated by the SW action fetch.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      if (!event.data) return;
      const { type, reminderId, occurrenceId, minutes } = event.data;

      if (type === 'SNOOZE_OCCURRENCE' && reminderId) {
        snoozeOccurrence(reminderId, occurrenceId || 'unknown', minutes || 5);
      }
      if (type === 'COMPLETE_OCCURRENCE' && reminderId) {
        completeOccurrence(reminderId, occurrenceId || 'unknown');
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [snoozeOccurrence, completeOccurrence]);

  // ─── Foreground fallback (sound only, no modal when Web Push is active) ─────
  // This interval still fires while the tab is open so we can play an audio cue.
  // The SweetAlert modal is suppressed if a Web Push subscription is registered
  // because the OS notification (already dispatched by the server-side scheduler
  // → sw.js push event) is the correct UX for Web/PWA.
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = new Date();
      const pushActive = hasPushSubRef.current ?? await hasActivePushSubscription().then(v => {
        hasPushSubRef.current = v;
        return v;
      });

      reminders.forEach(r => {
        if (!r.isActive) return;

        const activeOcc = occurrences.find(o =>
          o.reminderId === r.id && (o.status === 'scheduled' || o.status === 'snoozed')
        );

        if (!activeOcc) return;

        let scheduledTime = 0;
        if (activeOcc.status === 'snoozed' && activeOcc.snoozedUntil) {
          scheduledTime = new Date(activeOcc.snoozedUntil).getTime();
        } else if (activeOcc.scheduledAt) {
          scheduledTime = new Date(activeOcc.scheduledAt).getTime();
        }

        if (scheduledTime > 0 && scheduledTime <= now.getTime()) {
          const lastFiredKey = `occ_fired_${activeOcc.id}`;
          const lastFired = localStorage.getItem(lastFiredKey);
          if (lastFired && (now.getTime() - parseInt(lastFired)) < 60000) return;

          localStorage.setItem(lastFiredKey, now.getTime().toString());

          // Always play audio cue (works even when tab is background)
          playSound(r.sound || 'default');

          // ── Suppress SweetAlert modal when Web Push is the active channel ──
          // The OS notification was already dispatched (or will be dispatched within
          // the next cron cycle) by the server-side scheduler + sw.js push handler.
          // Showing a duplicate in-app modal here would create confusing UX.
          if (pushActive) {
            console.log(`[ReminderNotifier] Occurrence ${activeOcc.id} due — Web Push active, skipping in-app modal. Audio cue played.`);
            // Trigger a data refresh so reminder list reflects server state after push
            fetchReminders().catch(() => {});
            return;
          }

          // ── Fallback modal for non-push sessions (e.g. push permission denied) ──
          import('sweetalert2').then(({ default: Swal }) => {
            Swal.fire({
              title: r.title,
              text: r.body || `Waktu pengingat Anda (${r.time}) telah tiba!`,
              icon: 'info',
              showCancelButton: true,
              showDenyButton: true,
              confirmButtonText: '⏱ Snooze 5 Min',
              denyButtonText: '⏱ Snooze 15 Min',
              cancelButtonText: '❌ Close / Complete',
              confirmButtonColor: '#3b82f6',
              denyButtonColor: '#8b5cf6',
              cancelButtonColor: '#6b7280',
              allowOutsideClick: false,
              allowEscapeKey: false,
              backdrop: `rgba(0,0,0,0.85)`
            }).then((result) => {
              if (result.isConfirmed) {
                snoozeOccurrence(r.id, activeOcc.id, 5);
              } else if (result.isDenied) {
                snoozeOccurrence(r.id, activeOcc.id, 15);
              } else {
                completeOccurrence(r.id, activeOcc.id);
              }
            });
          });
        }
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [reminders, occurrences, snoozeOccurrence, completeOccurrence, fetchReminders]);

  return null;
}
