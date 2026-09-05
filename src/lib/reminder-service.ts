import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import webpush from 'web-push';
import { formatLocalFromUTC } from '@/lib/timezone';

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

  // 1. Fetch Push Subscribers from database
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

    if (!reminderErr && data && data.length > 0) {
      dueRemindersFromTable = data;
    }
  } catch (e: any) {
    addLog(`Notice: 'reminders' table query notice: ${e.message}`);
  }

  if (dueRemindersFromTable && dueRemindersFromTable.length > 0) {
    foundCount += dueRemindersFromTable.length;
    addLog(`Primary Table Strategy: Found ${dueRemindersFromTable.length} due reminders in 'reminders' table`);

    // Claim occurrence: Atomic state lock (scheduled/snoozed -> processing)
    const dueIds = dueRemindersFromTable.map(r => r.id);
    await supabase
      .from('reminders')
      .update({ status: 'processing', updated_at: nowISO })
      .in('id', dueIds);

    for (const r of dueRemindersFromTable) {
      totalProcessed++;
      const occurrenceId = crypto.randomUUID();
      const scheduledLocalWIB = formatLocalFromUTC(r.scheduled_at, r.timezone || 'Asia/Jakarta');
      addLog(`Processing table reminder id=${r.id} occurrenceId=${occurrenceId} title="${r.title}" scheduledAt=${r.scheduled_at} (${scheduledLocalWIB})`);

      const targetSubs = subscribers.filter(s => !r.user_id || s.user_id === r.user_id || subscribers.length === 1);
      const subsToSend = targetSubs.length > 0 ? targetSubs : subscribers;

      // NO OPEN ACTION! ONLY CLOSE & SNOOZE
      const payload = JSON.stringify({
        type: 'reminder',
        reminderId: r.id,
        occurrenceId,
        notificationTag: `reminder-${r.id}-${occurrenceId}`,
        title: r.title,
        body: r.body || `Waktu pengingat Anda (${r.time || 'sekarang'}) telah tiba!`,
        scheduledAt: r.scheduled_at,
        isRecurring: r.frequency && r.frequency !== 'once',
        source: r.title?.includes('Uji') ? 'scheduled-test' : 'scheduled',
        actions: [
          { action: 'close', title: '❌ CLOSE' },
          { action: 'snooze_5', title: '⏱ 5 MIN' },
          { action: 'snooze_15', title: '⏱ 15 MIN' },
          { action: 'snooze_60', title: '⏱ 1 HOUR' }
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

      // Mark status as 'sent' so it will NEVER be picked up again
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
  for (const sub of subscribers) {
    if (!sub.reminders || !Array.isArray(sub.reminders) || sub.reminders.length === 0) continue;

    let subscriberJsonModified = false;
    const updatedSubReminders = [...sub.reminders];

    for (let i = 0; i < updatedSubReminders.length; i++) {
      const r = updatedSubReminders[i];

      // ONLY process if status is 'scheduled' or 'snoozed' AND isActive is true
      const rStatus = r.status || 'scheduled';
      const rActive = r.isActive !== false;

      if (!rActive || (rStatus !== 'scheduled' && rStatus !== 'snoozed')) {
        continue;
      }

      let isDue = false;

      if (r.scheduledAt) {
        const scheduledTime = new Date(r.scheduledAt).getTime();
        if (scheduledTime <= now.getTime()) {
          isDue = true;
        }
      }

      if (isDue) {
        foundCount++;
        totalProcessed++;
        const occurrenceId = crypto.randomUUID();

        addLog(`Fallback Strategy: Due reminder found in push_subscribers JSON: id=${r.id} title="${r.title}"`);

        // Claim in JSON array immediately so it won't loop
        updatedSubReminders[i] = {
          ...r,
          status: 'sent',
          isActive: false, // Mark inactive for one-time fallback to PREVENT LOOPING
          updatedAt: nowISO
        };
        subscriberJsonModified = true;

        // NO OPEN ACTION! ONLY CLOSE & SNOOZE
        const payload = JSON.stringify({
          type: 'reminder',
          reminderId: r.id,
          occurrenceId,
          notificationTag: `reminder-${r.id}-${occurrenceId}`,
          title: r.title,
          body: r.body || `Waktu pengingat Anda (${r.time || 'sekarang'}) telah tiba!`,
          scheduledAt: r.scheduledAt || nowISO,
          isRecurring: r.frequency && r.frequency !== 'once',
          source: r.title?.includes('Uji') ? 'scheduled-test' : 'scheduled',
          actions: [
            { action: 'close', title: '❌ CLOSE' },
            { action: 'snooze_5', title: '⏱ 5 MIN' },
            { action: 'snooze_15', title: '⏱ 15 MIN' },
            { action: 'snooze_60', title: '⏱ 1 HOUR' }
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

    // Persist updated JSON array to Supabase DB to permanently lock state
    if (subscriberJsonModified) {
      await supabase
        .from('push_subscribers')
        .update({ reminders: updatedSubReminders })
        .eq('endpoint', sub.endpoint);
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
