// Native Android Alarm Bridge Engine
// Leverages Capacitor LocalNotifications & OS AlarmManager for Exact Offline Alarms when App is Terminated

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, ActionPerformed } from '@capacitor/local-notifications';
import { addToOfflineQueue, updateOccurrenceInIDB, getOccurrencesFromIDB } from '@/lib/idb';

// Convert string UUID into deterministic positive 32-bit Integer for Android LocalNotification ID
function hashStringToId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export interface ScheduleNativeAlarmInput {
  reminderId: string;
  occurrenceId: string;
  title: string;
  body?: string;
  scheduledAt: string; // ISO string UTC
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform() || (window as any).isAndroidNativeBridge === true;
}

export async function requestNativeAlarmPermissions(): Promise<{ notifications: string; displayAlert?: boolean }> {
  if (!isNativePlatform()) {
    return { notifications: 'denied' };
  }

  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') {
      const requestRes = await LocalNotifications.requestPermissions();
      return { notifications: requestRes.display };
    }
    return { notifications: status.display };
  } catch (err) {
    console.warn('[NATIVE ALARM] Permission request notice:', err);
    return { notifications: 'denied' };
  }
}

export async function initNativeAlarmListeners(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    // 1. Register Notification Action Category (CLOSE & SNOOZE buttons)
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'REMINDER_ALARM_ACTIONS',
          actions: [
            { id: 'close', title: '❌ CLOSE' },
            { id: 'snooze_5', title: '⏱ SNOOZE 5 MIN' },
            { id: 'snooze_15', title: '⏱ SNOOZE 15 MIN' }
          ]
        }
      ]
    });

    // 2. Add Listener for Native Notification Action Button Clicks
    LocalNotifications.addListener('localNotificationActionPerformed', async (action: ActionPerformed) => {
      const { actionId, notification } = action;
      const extra = notification.extra || {};
      const reminderId = extra.reminderId;
      const occurrenceId = extra.occurrenceId || 'unknown';

      console.log(`[NATIVE ALARM] Action clicked: ${actionId} for reminderId=${reminderId} occurrenceId=${occurrenceId}`);

      if (actionId === 'snooze_5' || actionId === 'snooze_15') {
        const minutes = actionId === 'snooze_15' ? 15 : 5;
        const now = new Date();
        const snoozeDate = new Date(now.getTime() + minutes * 60 * 1000);
        const snoozeISO = snoozeDate.toISOString();

        // Reschedule local native alarm for snooze
        await scheduleNativeLocalAlarm({
          reminderId,
          occurrenceId,
          title: notification.title || 'Pengingat AgendaRecap',
          body: notification.body || '',
          scheduledAt: snoozeISO
        });

        // Queue offline snooze mutation
        await addToOfflineQueue({
          type: 'SNOOZE_OCCURRENCE',
          payload: { reminderId, occurrenceId, minutes }
        });
      } else if (actionId === 'close' || actionId === 'tap') {
        // Queue offline complete/dismiss mutation
        await addToOfflineQueue({
          type: 'COMPLETE_OCCURRENCE',
          payload: { reminderId, occurrenceId }
        });
      }
    });

    console.log('[NATIVE ALARM] Action listeners initialized successfully.');
  } catch (err) {
    console.warn('[NATIVE ALARM] Listener initialization notice:', err);
  }
}

export async function scheduleNativeLocalAlarm(input: ScheduleNativeAlarmInput): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const targetDate = new Date(input.scheduledAt);
    const now = new Date();

    // If target date is in past, don't schedule past alarm
    if (targetDate.getTime() <= now.getTime()) {
      console.warn('[NATIVE ALARM] Scheduled time is in the past, skipping native alarm.');
      return false;
    }

    const notificationNumericId = hashStringToId(`occ_${input.occurrenceId}`);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationNumericId,
          title: input.title,
          body: input.body || 'Waktu pengingat Anda telah tiba!',
          schedule: {
            at: targetDate,
            allowWhileIdle: true // Exact OS AlarmManager wakeup in Doze mode
          },
          sound: 'beep.wav',
          actionTypeId: 'REMINDER_ALARM_ACTIONS',
          extra: {
            reminderId: input.reminderId,
            occurrenceId: input.occurrenceId,
            scheduledAt: input.scheduledAt
          }
        }
      ]
    });

    console.log(`[NATIVE ALARM] Scheduled exact OS alarm numericID=${notificationNumericId} target=${input.scheduledAt}`);
    return true;
  } catch (err) {
    console.error('[NATIVE ALARM] Schedule error:', err);
    return false;
  }
}

export async function cancelNativeLocalAlarm(occurrenceId: string): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const notificationNumericId = hashStringToId(`occ_${occurrenceId}`);
    await LocalNotifications.cancel({
      notifications: [{ id: notificationNumericId }]
    });
    console.log(`[NATIVE ALARM] Cancelled OS alarm numericID=${notificationNumericId}`);
    return true;
  } catch (err) {
    console.warn('[NATIVE ALARM] Cancel notice:', err);
    return false;
  }
}

export async function cancelAllNativeLocalAlarms(): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }
    console.log(`[NATIVE ALARM] Cancelled all ${pending.notifications.length} pending local alarms.`);
    return true;
  } catch (err) {
    console.warn('[NATIVE ALARM] Cancel all notice:', err);
    return false;
  }
}
