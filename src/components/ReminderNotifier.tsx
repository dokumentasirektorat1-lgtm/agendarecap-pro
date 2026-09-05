"use client";

import { useEffect } from "react";
import { useReminderStore } from "@/store/useReminderStore";
import Swal from 'sweetalert2';

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

export default function ReminderNotifier() {
  const { reminders, occurrences, fetchReminders, snoozeOccurrence, completeOccurrence } = useReminderStore();

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Listen to messages from Service Worker (e.g. Snooze / Close actions clicked from Push Notifications)
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

  // Foreground active tab timer check (Runs every 15s when tab is open)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();

      reminders.forEach(r => {
        if (!r.isActive) return;

        // STRICT CHECK: ONLY trigger for occurrences that are actively 'scheduled' or 'snoozed'
        // NEVER trigger for 'completed', 'dismissed', 'sent', or 'failed'
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

          playSound(r.sound || 'default');

          // Sticky In-App Modal with Title & Body Detail
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
        }
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [reminders, occurrences, snoozeOccurrence, completeOccurrence]);

  return null;
}
