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
  const { reminders, fetchReminders } = useReminderStore();

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

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

  // Foreground tab timer check
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentHHmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const dayOfWeek = now.getDay();

      reminders.forEach(r => {
        if (!r.isActive) return;
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

          const notificationOptions: any = {
            body: "Pengingat Personal AgendaRecap",
            icon: "/icon-192x192.png",
            tag: `reminder-${r.id}`,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200],
          };

          if ('Notification' in window && Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
              reg.showNotification(r.title, notificationOptions);
            }).catch(() => {
              new Notification(r.title, notificationOptions);
            });
            
            playSound(r.sound || 'default');
          }

          // Sticky in-app modal when foreground
          Swal.fire({
            title: r.title,
            text: `Waktu pengingat Anda (${r.time}) telah tiba!`,
            icon: 'info',
            showConfirmButton: true,
            confirmButtonText: 'Oke, Mengerti',
            allowOutsideClick: false,
            allowEscapeKey: false,
            backdrop: `rgba(0,0,0,0.8)`
          });
        }
      });
    }, 30000); // check every 30s

    return () => clearInterval(interval);
  }, [reminders]);

  return null; 
}
