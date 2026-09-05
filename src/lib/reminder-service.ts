import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import webpush from 'web-push';
import { formatLocalFromUTC, getUTCISOFromLocal } from '@/lib/timezone';

export interface ProcessRemindersResult {
  success: boolean;
  checkedAt: string;
  foundCount: number;
  processedCount: number;
  successPushCount: number;
  failedPushCount: number;
  logs: string[];
  error?: string;
}

// In-memory tracker for fallback push deduplication to avoid firing twice within 60 seconds
const firedFallbackMap: Record<string, number> = {};

export async function processDueReminders(): Promise<ProcessRemindersResult> {
  const logs: string[] = [];
  const addLog = (msg: string) => {
    const timeStr = new Date().toISOString();
    const logLine = `[REMINDER ${timeStr}] ${msg}`;
    console.log(logLine);
    logs.push(logLine);
  };

  addLog('Scheduler started - Checking pending reminders');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  const supabase = createAdminSupabase(supabaseUrl, serviceKey);

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@agendarecap.com';

  if (!vapidPublic || !vapidPrivate) {
    addLog('CRITICAL: VAPID keys not configured in environment variables');
    return {
      success: false,
      checkedAt: new Date().toISOString(),
      foundCount: 0,
      processedCount: 0,
      successPushCount: 0,
      failedPushCount: 0,
      logs,
      error: 'VAPID keys not configured'
    };
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  } catch (err: any) {
    addLog(`VAPID setup error: ${err.message}`);
  }

  const now = new Date();
  const nowISO = now.toISOString();
  const nowLocalWIB = formatLocalFromUTC(nowISO, 'Asia/Jakarta');
  addLog(`Server Current Time: UTC=${nowISO} | Asia/Jakarta=${nowLocalWIB}`);

  let successPushCount = 0;
  let failedPushCount = 0;
  let totalProcessed = 0;
  let foundCount = 0;

  // =========================================================================
  // STRATEGY 1: Primary `reminders` table query
  // =========================================================================
  let dueRemindersFromTable: any[] | null = null;
  try {
    const { data, error: reminderErr } = await supabase
      .from('reminders')
      .select('*')
      .in('status', ['scheduled', 'snoozed'])
      .lte('scheduled_at', nowISO)
      .eq('is_active', true);

    if (reminderErr) {
      addLog(`Notice: 'reminders' table query notice: ${reminderErr.message} (Will fallback to push_subscribers schema if needed)`);
    } else {
      dueRemindersFromTable = data;
    }
  } catch (e: any) {
    addLog(`Notice: 'reminders' table exception: ${e.message}`);
  }

  // Fetch Push Subscribers from database
  const { data: subscribers, error: subErr } = await supabase
    .from('push_subscribers')
    .select('*');

  if (subErr || !subscribers || subscribers.length === 0) {
    addLog(`WARNING: No active push subscribers found in database! (subscribers count = 0)`);
    return {
      success: true,
      checkedAt: nowISO,
      foundCount: 0,
      processedCount: 0,
      successPushCount: 0,
      failedPushCount: 0,
      logs,
      error: 'No active push subscribers in DB'
    };
  }

  addLog(`Active Push Subscribers in DB: ${subscribers.length}`);

  if (dueRemindersFromTable && dueRemindersFromTable.length > 0) {
    foundCount += dueRemindersFromTable.length;
    addLog(`Primary Table Strategy: Found ${dueRemindersFromTable.length} due reminders in 'reminders' table`);

    // Acquire atomic processing lock
    const dueIds = dueRemindersFromTable.map(r => r.id);
    await supabase
      .from('reminders')
      .update({ status: 'processing', updated_at: nowISO })
      .in('id', dueIds);

    for (const r of dueRemindersFromTable) {
      totalProcessed++;
      const scheduledLocalWIB = formatLocalFromUTC(r.scheduled_at, r.timezone || 'Asia/Jakarta');
      addLog(`Processing table reminder id=${r.id} title="${r.title}" scheduledAt=${r.scheduled_at} (${scheduledLocalWIB})`);

      const targetSubs = subscribers.filter(s => !r.user_id || s.user_id === r.user_id || subscribers.length === 1);
      const subsToSend = targetSubs.length > 0 ? targetSubs : subscribers;

      const payload = JSON.stringify({
        type: 'reminder',
        id: r.id,
        reminderId: r.id,
        title: r.title,
        body: r.body || `Waktu pengingat Anda (${r.time || 'sekarang'}) telah tiba!`,
        scheduledAt: r.scheduled_at,
        notificationTag: r.notification_tag || `reminder-${r.id}`,
        url: '/reminders',
        actions: [
          { action: 'open', title: '📂 OPEN' },
          { action: 'snooze_5', title: '⏱ 5 MIN' },
          { action: 'snooze_15', title: '⏱ 15 MIN' },
          { action: 'snooze_60', title: '⏱ 1 HOUR' },
          { action: 'close', title: '❌ CLOSE' }
        ]
      });

      let pushSuccess = false;
      for (const sub of subsToSend) {
        addLog(`Pushing to subscriber endpoint=${sub.endpoint.substring(0, 35)}...`);
        try {
          const res = await webpush.sendNotification(sub.subscription, payload);
          addLog(`Push success status=${res.statusCode} endpoint=${sub.endpoint.substring(0, 30)}...`);
          successPushCount++;
          pushSuccess = true;
        } catch (err: any) {
          failedPushCount++;
          addLog(`Push failed error=${err.message} statusCode=${err.statusCode}`);
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscribers').delete().eq('endpoint', sub.endpoint);
          }
        }
      }

      const finalStatus = pushSuccess ? 'sent' : 'failed';
      await supabase
        .from('reminders')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', r.id);
    }
  }

  // =========================================================================
  // STRATEGY 2: Fallback `push_subscribers.reminders` JSONB array scan
  // =========================================================================
  const gmt7Time = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const currentHHmm = `${gmt7Time.getUTCHours().toString().padStart(2, '0')}:${gmt7Time.getUTCMinutes().toString().padStart(2, '0')}`;
  const dayOfWeek = gmt7Time.getUTCDay();
  const todayStr = gmt7Time.toISOString().split('T')[0];

  for (const sub of subscribers) {
    if (!sub.reminders || !Array.isArray(sub.reminders)) continue;

    for (const r of sub.reminders) {
      if (r.isActive === false) continue;

      let isDue = false;

      // 1. Check explicit scheduledAt ISO timestamp
      if (r.scheduledAt) {
        const scheduledTime = new Date(r.scheduledAt).getTime();
        if (scheduledTime <= now.getTime()) {
          isDue = true;
        }
      }
      
      // 2. Fallback check HH:mm time match
      if (!isDue && r.time === currentHHmm) {
        if (r.frequency === 'once' || !r.frequency) {
          const createdDate = r.createdAt ? new Date(r.createdAt).toDateString() : now.toDateString();
          if (createdDate === now.toDateString() || new Date(r.createdAt || 0).getTime() <= now.getTime()) {
            isDue = true;
          }
        } else if (r.frequency === 'daily') {
          isDue = true;
        } else if (r.frequency === 'weekdays' && dayOfWeek !== 0 && dayOfWeek !== 6) {
          isDue = true;
        } else if (r.frequency === 'weekly' && r.daysOfWeek?.includes(dayOfWeek)) {
          isDue = true;
        }
      }

      if (isDue) {
        const dedupeKey = `${r.id}_${todayStr}_${r.time || currentHHmm}`;
        const lastFired = firedFallbackMap[dedupeKey];
        if (lastFired && (now.getTime() - lastFired) < 60000) {
          // Already fired within last 60s
          continue;
        }

        foundCount++;
        totalProcessed++;
        firedFallbackMap[dedupeKey] = now.getTime();

        addLog(`Fallback Strategy: Due reminder found in push_subscribers JSON: id=${r.id} title="${r.title}" time=${r.time}`);

        const payload = JSON.stringify({
          type: 'reminder',
          id: r.id,
          reminderId: r.id,
          title: r.title,
          body: r.body || `Waktu pengingat Anda (${r.time || currentHHmm}) telah tiba!`,
          scheduledAt: r.scheduledAt || nowISO,
          notificationTag: `reminder-${r.id}`,
          url: '/reminders',
          actions: [
            { action: 'open', title: '📂 OPEN' },
            { action: 'snooze_5', title: '⏱ 5 MIN' },
            { action: 'snooze_15', title: '⏱ 15 MIN' },
            { action: 'snooze_60', title: '⏱ 1 HOUR' },
            { action: 'close', title: '❌ CLOSE' }
          ]
        });

        try {
          const res = await webpush.sendNotification(sub.subscription, payload);
          addLog(`Fallback push success status=${res.statusCode} for endpoint=${sub.endpoint.substring(0, 30)}...`);
          successPushCount++;
        } catch (err: any) {
          failedPushCount++;
          addLog(`Fallback push failed error=${err.message} statusCode=${err.statusCode}`);
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscribers').delete().eq('endpoint', sub.endpoint);
          }
        }
      }
    }
  }

  addLog(`Scheduler execution finished: Total Found=${foundCount}, SentPush=${successPushCount}, FailedPush=${failedPushCount}`);

  return {
    success: true,
    checkedAt: nowISO,
    foundCount,
    processedCount: totalProcessed,
    successPushCount,
    failedPushCount,
    logs
  };
}
