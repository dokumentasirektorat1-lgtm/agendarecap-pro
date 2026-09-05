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
    console.error("Audio block:", e);
  }
}

export default function ReminderNotifier() {
  const { reminders, fetchReminders, snoozeReminder, updateReminderStatus } = useReminderStore();

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Listen to messages from Service Worker (e.g. Snooze / Dismiss actions from Notification UI)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      if (!event.data) return;
      const { type, reminderId, minutes, status } = event.data;

      if (type === 'REMINDER_SNOOZED' && reminderId) {
        snoozeReminder(reminderId, minutes || 5);
      }
      if (type === 'REMINDER_STATUS_CHANGED' && reminderId && status) {
        updateReminderStatus(reminderId, status);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [snoozeReminder, updateReminderStatus]);

  // Sync active reminders to Service Worker for OFFLINE & Closed-App background delivery
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        if (reg.active) {
          reg.active.postMessage({
            type: 'SYNC_REMINDERS',
            reminders
          });
        }
      });
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_REMINDERS',
          reminders
        });
      }
    }
  }, [reminders]);

  // Foreground tab timer check (Runs every 30 seconds only when tab is active)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentHHmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const dayOfWeek = now.getDay();

      reminders.forEach(r => {
        if (!r.isActive || r.status === 'completed' || r.status === 'dismissed' || r.status === 'cancelled') return;
        if (r.time !== currentHHmm) return;

        let shouldNotify = false;
        if (r.frequency === 'once') {
          const createdDate = new Date(r.createdAt).toDateString();
          if (createdDate === now.toDateString()) {
             shouldNotify = true;
          }
        } else if (r.frequency === 'daily') {
          shouldNotify = true;
        } else if (r.frequency === 'weekdays' && dayOfWeek !== 0 && dayOfWeek !== 6) {
          shouldNotify = true;
        } else if (r.frequency === 'weekly' && r.daysOfWeek?.includes(dayOfWeek)) {
          shouldNotify = true;
        }

        if (shouldNotify) {
          const lastFired = localStorage.getItem(`reminder_fired_${r.id}`);
          if (lastFired && (now.getTime() - parseInt(lastFired)) < 60000) return;

          localStorage.setItem(`reminder_fired_${r.id}`, now.getTime().toString());

          playSound(r.sound || 'default');

          // Sticky in-app modal when user is currently viewing the foreground tab
          Swal.fire({
            title: r.title,
            text: r.body || `Waktu pengingat Anda (${r.time}) telah tiba!`,
            icon: 'info',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: '⏱ Snooze 5 Min',
            denyButtonText: '⏱ Snooze 15 Min',
            cancelButtonText: '❌ Close / Dismiss',
            confirmButtonColor: '#3b82f6',
            denyButtonColor: '#8b5cf6',
            cancelButtonColor: '#6b7280',
            allowOutsideClick: false,
            allowEscapeKey: false,
            backdrop: `rgba(0,0,0,0.8)`
          }).then((result) => {
            if (result.isConfirmed) {
              snoozeReminder(r.id, 5);
            } else if (result.isDenied) {
              snoozeReminder(r.id, 15);
            } else {
              updateReminderStatus(r.id, 'dismissed');
            }
          });
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [reminders, snoozeReminder, updateReminderStatus]);

  return null; 
}
