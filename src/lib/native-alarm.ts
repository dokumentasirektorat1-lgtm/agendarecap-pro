// Native Android Alarm Bridge Engine
// Bridges Next.js TypeScript client with Java NativeAlarmPlugin on Android, with Web Fallbacks

import { Capacitor, registerPlugin } from '@capacitor/core';
import { reminderRepository } from '@/lib/repositories/reminder-repository';
import { syncRepository } from '@/lib/repositories/sync-repository';
import { getAppName } from '@/lib/branding';

export interface NativePendingAction {
  actionId: string;
  type: 'COMPLETE' | 'SNOOZE' | 'DISMISS';
  reminderId: string;
  occurrenceId: string;
  minutes?: number;
  snoozedUntilMs?: number;
  timestamp: number;
}

export interface NativeAlarmPluginInterface {
  schedule(options: {
    reminderId: string;
    occurrenceId: string;
    title: string;
    note?: string;
    sound?: string;
    scheduledAtMs: number;
  }): Promise<{ success: boolean; occurrenceId?: string; scheduledAtMs?: number }>;

  cancel(options: { occurrenceId: string }): Promise<{ success: boolean }>;

  snooze(options: {
    reminderId: string;
    occurrenceId: string;
    minutes: number;
    title?: string;
    note?: string;
    sound?: string;
  }): Promise<{ success: boolean; snoozedMinutes?: number; snoozedUntilMs?: number }>;

  cancelAll(): Promise<{ success: boolean }>;

  getScheduled(): Promise<{ alarms: any[] }>;

  getPendingNativeActions(): Promise<{ actions: NativePendingAction[] }>;

  acknowledgeNativeAction(options: { actionId: string }): Promise<{ success: boolean }>;

  checkPermissions(): Promise<{ notifications: string; exactAlarm: boolean }>;

  requestExactAlarmPermission(): Promise<{ opened: boolean; alreadyGranted?: boolean }>;

  playAudioPreview(options: { sound: string }): Promise<{ playing: boolean; sound: string }>;

  stopAudioPreview(): Promise<{ playing: boolean }>;

  getFCMToken(): Promise<{ token: string }>;

  updateWidgetData(options: { items: Array<{ title: string; time: string; date?: string }> }): Promise<{ success: boolean }>;

  updateConsultationWidgetData(options: { items: Array<{ title: string; notes?: string; count?: number }> }): Promise<{ success: boolean }>;

  updateAgenda7DaysWidgetData(options: { items: Array<{ title: string; time: string; date: string }> }): Promise<{ success: boolean }>;

  saveAndOpenFile(options: {
    fileName: string;
    base64Data: string;
    mimeType?: string;
    openFile?: boolean;
  }): Promise<{ success: boolean; fileName?: string; savedLocation?: string }>;

  saveCustomSound(options: {
    base64Data: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ success: boolean; soundUri?: string; soundName?: string }>;

  setAppBranding(options: { appName: string; appLogo?: string }): Promise<{ success: boolean }>;
}

const getNativeAlarmPlugin = (): NativeAlarmPluginInterface => {
  if (typeof window !== 'undefined' && (window as any).__NativeAlarmPluginInstance) {
    return (window as any).__NativeAlarmPluginInstance;
  }
  if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.NativeAlarm) {
    (window as any).__NativeAlarmPluginInstance = (window as any).Capacitor.Plugins.NativeAlarm;
    return (window as any).__NativeAlarmPluginInstance;
  }
  const plugin = registerPlugin<NativeAlarmPluginInterface>('NativeAlarm');
  if (typeof window !== 'undefined') {
    (window as any).__NativeAlarmPluginInstance = plugin;
  }
  return plugin;
};

const NativeAlarm = new Proxy({} as NativeAlarmPluginInterface, {
  get(_target, prop) {
    const instance = getNativeAlarmPlugin();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});

export interface ScheduleNativeAlarmInput {
  reminderId: string;
  occurrenceId: string;
  title: string;
  body?: string;
  sound?: string;
  scheduledAt: string; // ISO string UTC
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform() || (window as any).isAndroidNativeBridge === true || (window as any).Capacitor?.isNativePlatform?.() === true;
}

/**
 * Safely navigates to a target static HTML file or route in Native/Capacitor environment.
 * Prevents root origin leading-slash bugs on file:// or custom WebView schemes.
 */
export function navigateNative(targetFile: string, replace = false): void {
  if (typeof window === 'undefined') return;

  const cleanFile = targetFile.startsWith('/') ? targetFile.substring(1) : targetFile;
  let targetUrl = '/' + cleanFile;

  if (isNativePlatform()) {
    const href = window.location.href;
    const protocol = window.location.protocol;

    if (protocol === 'file:') {
      const publicIndex = href.indexOf('/public/');
      if (publicIndex !== -1) {
        const publicBase = href.substring(0, publicIndex + 8);
        targetUrl = publicBase + cleanFile;
      } else {
        const lastSlash = href.lastIndexOf('/');
        targetUrl = href.substring(0, lastSlash + 1) + cleanFile;
      }
    } else {
      targetUrl = window.location.origin + '/' + cleanFile;
    }
  }

  console.log(`[NATIVE NAV] Request: "${targetFile}" -> Resolved: "${targetUrl}" (replace=${replace})`);

  if (replace) {
    window.location.replace(targetUrl);
  } else {
    window.location.href = targetUrl;
  }
}


/**
 * Imports pending native user actions (e.g. COMPLETE / SNOOZE pressed from Android notifications while app was closed)
 * into local IndexedDB repository and triggers offline queue sync.
 */
export async function syncNativeActionsToIndexedDB(): Promise<number> {
  if (!isNativePlatform()) return 0;

  try {
    const { actions } = await NativeAlarm.getPendingNativeActions();
    if (!actions || actions.length === 0) return 0;

    console.log(`[NATIVE ALARM SYNC] Found ${actions.length} pending native notification user actions.`);
    let processed = 0;

    for (const action of actions) {
      try {
        if (action.type === 'COMPLETE') {
          await reminderRepository.completeOccurrence(action.reminderId, action.occurrenceId);
        } else if (action.type === 'SNOOZE') {
          await reminderRepository.snoozeOccurrence(action.reminderId, action.occurrenceId, action.minutes || 5);
        }

        // Acknowledge after safe import into IndexedDB & offline queue
        await NativeAlarm.acknowledgeNativeAction({ actionId: action.actionId });
        processed++;
        console.log(`[NATIVE ALARM SYNC] Processed & acknowledged native action: ${action.actionId}`);
      } catch (actionErr) {
        console.error(`[NATIVE ALARM SYNC] Failed to import action ${action.actionId}:`, actionErr);
      }
    }

    if (processed > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
      syncRepository.runSync().catch(err => console.warn('[NATIVE ALARM SYNC] Sync notice:', err));
    }

    return processed;
  } catch (err) {
    console.warn('[NATIVE ALARM SYNC] syncNativeActionsToIndexedDB notice:', err);
    return 0;
  }
}

export function initNativeAlarmListeners(): void {
  if (isNativePlatform()) {
    console.log('[NATIVE ALARM] Native Android Alarm Engine initialized.');
    syncNativeActionsToIndexedDB();
    syncRepository.runSync().catch(err => console.warn('[NATIVE ALARM] Sync notice:', err));

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        syncNativeActionsToIndexedDB();
        syncRepository.runSync().catch(err => console.warn('[NATIVE ALARM] Focus sync notice:', err));
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          syncNativeActionsToIndexedDB();
          syncRepository.runSync().catch(err => console.warn('[NATIVE ALARM] Visibility sync notice:', err));
        }
      });
    }
  }
}

export async function checkNativeAlarmPermissions(): Promise<{ notifications: string; exactAlarm: boolean }> {
  if (!isNativePlatform()) {
    const perm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied';
    return { notifications: perm, exactAlarm: true };
  }

  try {
    const status = await NativeAlarm.checkPermissions();
    return status;
  } catch (err) {
    console.warn('[NATIVE ALARM] checkPermissions notice:', err);
    return { notifications: 'denied', exactAlarm: false };
  }
}

export async function requestExactAlarmPermission(): Promise<boolean> {
  if (!isNativePlatform()) return true;

  try {
    const res = await NativeAlarm.requestExactAlarmPermission();
    return res.opened || res.alreadyGranted === true;
  } catch (err) {
    console.warn('[NATIVE ALARM] requestExactAlarmPermission notice:', err);
    return false;
  }
}

export interface NotificationSoundSetting {
  soundEnabled: boolean;
  soundOption: string;
  customSoundUri?: string;
  customSoundName?: string;
}

export function getNotificationSoundSetting(): NotificationSoundSetting {
  if (typeof window === 'undefined') {
    return { soundEnabled: true, soundOption: 'default' };
  }
  const enabledStr = localStorage.getItem('agendarecap_sound_enabled');
  const soundEnabled = enabledStr !== null ? enabledStr !== 'false' : true;
  const soundOption = localStorage.getItem('agendarecap_default_sound') || 'default';
  const customSoundUri = localStorage.getItem('agendarecap_custom_sound_uri') || undefined;
  const customSoundName = localStorage.getItem('agendarecap_custom_sound_name') || undefined;

  return {
    soundEnabled,
    soundOption: (soundOption === 'off' || soundOption === 'silent') ? 'default' : soundOption,
    customSoundUri,
    customSoundName
  };
}

export function saveNotificationSoundSetting(setting: NotificationSoundSetting): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('agendarecap_sound_enabled', setting.soundEnabled ? 'true' : 'false');
  const effective = setting.soundEnabled ? setting.soundOption : 'off';
  localStorage.setItem('agendarecap_default_sound', effective);
  if (setting.customSoundUri) {
    localStorage.setItem('agendarecap_custom_sound_uri', setting.customSoundUri);
  }
  if (setting.customSoundName) {
    localStorage.setItem('agendarecap_custom_sound_name', setting.customSoundName);
  }
}

export function getEffectiveNotificationSound(requestedSound?: string): string {
  if (typeof window === 'undefined') return requestedSound || 'default';
  const setting = getNotificationSoundSetting();

  if (!setting.soundEnabled) {
    return 'silent';
  }

  const soundToUse = requestedSound && requestedSound !== 'default' ? requestedSound : setting.soundOption;
  if (soundToUse === 'off' || soundToUse === 'silent') {
    return 'silent';
  }
  if (soundToUse === 'custom' && setting.customSoundUri) {
    return setting.customSoundUri;
  }
  return soundToUse || 'default';
}

export async function scheduleNativeLocalAlarm(input: ScheduleNativeAlarmInput): Promise<boolean> {
  const targetDate = new Date(input.scheduledAt);
  const scheduledAtMs = targetDate.getTime();
  const nowMs = Date.now();

  if (scheduledAtMs <= nowMs) {
    console.warn('[NATIVE ALARM] Scheduled time is in the past, skipping native alarm schedule.');
    return false;
  }

  const effectiveSound = getEffectiveNotificationSound(input.sound);

  if (isNativePlatform()) {
    try {
      const perms = await checkNativeAlarmPermissions();
      const exactAlarmGranted = perms.exactAlarm;

      console.log(`[NATIVE ALARM] schedule requested | Occurrence ID: ${input.occurrenceId} | Alarm ID: ${input.reminderId} | Trigger timestamp: ${scheduledAtMs} (${input.scheduledAt}) | Current timestamp: ${nowMs} (${new Date(nowMs).toISOString()}) | Sound: ${effectiveSound} | Exact alarm permission: ${exactAlarmGranted ? 'GRANTED' : 'NOT GRANTED'} | Schedule result: ATTEMPTING`);

      if (!exactAlarmGranted) {
        console.warn('[NATIVE ALARM] EXACT_ALARM_PERMISSION = NOT GRANTED');
      }

      const res = await NativeAlarm.schedule({
        reminderId: input.reminderId,
        occurrenceId: input.occurrenceId,
        title: input.title,
        note: input.body || '',
        sound: effectiveSound,
        scheduledAtMs
      });
      console.log(`[NATIVE ALARM] schedule result: ${res.success ? 'SUCCESS' : 'FAILED'} | Occurrence ID: ${input.occurrenceId}`);
      return res.success;
    } catch (err: any) {
      console.error('[NATIVE ALARM] Native schedule error:', err);
      return false;
    }
  }

  return true;
}

export async function cancelNativeLocalAlarm(occurrenceId: string): Promise<boolean> {
  if (!isNativePlatform()) return true;

  try {
    const res = await NativeAlarm.cancel({ occurrenceId });
    console.log(`[NATIVE ALARM] Cancelled native OS alarm occurrenceId=${occurrenceId}`);
    return res.success;
  } catch (err) {
    console.warn('[NATIVE ALARM] Cancel native alarm notice:', err);
    return false;
  }
}

export async function snoozeNativeLocalAlarm(
  reminderId: string,
  occurrenceId: string,
  minutes: number,
  title?: string,
  note?: string,
  sound?: string
): Promise<boolean> {
  if (!isNativePlatform()) return true;

  try {
    const res = await NativeAlarm.snooze({
      reminderId,
      occurrenceId,
      minutes,
      title: title || `Pengingat ${getAppName()}`,
      note: note || '',
      sound: sound || 'default'
    });
    console.log(`[NATIVE ALARM] Snoozed native OS alarm occurrenceId=${occurrenceId} +${minutes} minutes`);
    return res.success;
  } catch (err) {
    console.warn('[NATIVE ALARM] Snooze native alarm notice:', err);
    return false;
  }
}

export async function cancelAllNativeLocalAlarms(): Promise<boolean> {
  if (!isNativePlatform()) return true;

  try {
    const res = await NativeAlarm.cancelAll();
    console.log('[NATIVE ALARM] Cancelled all pending native OS alarms.');
    return res.success;
  } catch (err) {
    console.warn('[NATIVE ALARM] Cancel all native alarms notice:', err);
    return false;
  }
}

export async function getScheduledNativeAlarms(): Promise<any[]> {
  if (!isNativePlatform()) return [];

  try {
    const res = await NativeAlarm.getScheduled();
    return res.alarms || [];
  } catch (err) {
    console.warn('[NATIVE ALARM] getScheduled notice:', err);
    return [];
  }
}

let webAudioCtx: any = null;
let webAudioOsc: any = null;
let webAudioElem: HTMLAudioElement | null = null;

export async function playNativeAudioPreview(sound: string): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      const res = await NativeAlarm.playAudioPreview({ sound });
      return res.playing;
    } catch (err) {
      console.warn('[NATIVE ALARM] playAudioPreview notice:', err);
      return false;
    }
  }

  // Web Browser Fallback Audio Preview
  try {
    await stopNativeAudioPreview();
    if (sound.startsWith('data:audio') || sound.startsWith('http://') || sound.startsWith('https://') || sound.startsWith('blob:')) {
      webAudioElem = new Audio(sound);
      await webAudioElem.play();
      return true;
    }

    const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioContextClass) return false;
    webAudioCtx = new AudioContextClass();
    const osc = webAudioCtx.createOscillator();
    const gain = webAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(webAudioCtx.destination);

    let freq = 440;
    if (sound === 'chime') freq = 587.33;
    else if (sound === 'digital') freq = 880;
    else if (sound === 'urgent') freq = 1046.5;
    else if (sound === 'ringtone') freq = 523.25;

    osc.frequency.setValueAtTime(freq, webAudioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, webAudioCtx.currentTime);
    osc.start();
    webAudioOsc = osc;
    return true;
  } catch (e) {
    return false;
  }
}

export async function stopNativeAudioPreview(): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      await NativeAlarm.stopAudioPreview();
      return true;
    } catch (err) {
      console.warn('[NATIVE ALARM] stopAudioPreview notice:', err);
      return false;
    }
  }

  try {
    if (webAudioElem) {
      webAudioElem.pause();
      webAudioElem = null;
    }
    if (webAudioOsc) {
      webAudioOsc.stop();
      webAudioOsc.disconnect();
      webAudioOsc = null;
    }
    if (webAudioCtx) {
      webAudioCtx.close();
      webAudioCtx = null;
    }
    return true;
  } catch (e) {
    return false;
  }
}

export async function getNativeFCMToken(): Promise<string | null> {
  if (!isNativePlatform()) return null;
  try {
    const res = await NativeAlarm.getFCMToken();
    return res && res.token ? res.token : null;
  } catch (err) {
    console.warn('[NATIVE ALARM] getFCMToken notice:', err);
    return null;
  }
}

export async function updateNativeWidgetData(items: Array<{ title: string; time: string; date?: string }>): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const res = await NativeAlarm.updateWidgetData({ items });
    return res.success;
  } catch (err) {
    console.warn('[NATIVE ALARM] updateWidgetData notice:', err);
    return false;
  }
}

export async function updateNativeConsultationWidgetData(items: Array<{ title: string; notes?: string; count?: number }>): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const res = await NativeAlarm.updateConsultationWidgetData({ items });
    return res.success;
  } catch (err) {
    console.warn('[NATIVE ALARM] updateConsultationWidgetData notice:', err);
    return false;
  }
}

export async function updateNativeAgenda7DaysWidgetData(items: Array<{ title: string; time: string; date: string }>): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const res = await NativeAlarm.updateAgenda7DaysWidgetData({ items });
    return res.success;
  } catch (err) {
    console.warn('[NATIVE ALARM] updateAgenda7DaysWidgetData notice:', err);
    return false;
  }
}

export async function saveAndOpenFileNative(options: {
  fileName: string;
  base64Data: string;
  mimeType?: string;
  openFile?: boolean;
}): Promise<{ success: boolean; fileName?: string; savedLocation?: string }> {
  if (!isNativePlatform()) return { success: false };
  try {
    return await NativeAlarm.saveAndOpenFile(options);
  } catch (err) {
    console.error('[NATIVE FILE SAVE] Failed to save file:', err);
    throw err;
  }
}

export async function saveCustomSoundNative(options: {
  base64Data: string;
  fileName?: string;
  mimeType?: string;
}): Promise<{ success: boolean; soundUri?: string; soundName?: string }> {
  if (!isNativePlatform()) return { success: false };
  try {
    return await NativeAlarm.saveCustomSound(options);
  } catch (err) {
    console.error('[NATIVE SOUND SAVE] Failed to save custom sound:', err);
    throw err;
  }
}

/**
 * Sends dynamic app branding (name + logo) to the Android native layer.
 * Widget headers will use this name instead of the hardcoded default.
 */
export async function setNativeAppBranding(appName: string, appLogo?: string): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const res = await NativeAlarm.setAppBranding({ appName, appLogo: appLogo || '' });
    console.log(`[NATIVE BRANDING] setAppBranding → name="${appName}" success=${res.success}`);
    return res.success;
  } catch (err) {
    console.warn('[NATIVE BRANDING] setAppBranding notice:', err);
    return false;
  }
}
