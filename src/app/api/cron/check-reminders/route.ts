import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// GET or POST /api/cron/check-reminders
export async function GET(request: Request) {
  return handleCheckReminders(request);
}

export async function POST(request: Request) {
  return handleCheckReminders(request);
}

async function handleCheckReminders(request: Request) {
  const url = new URL(request.url);
  const isManual = url.searchParams.get('manual') === 'true' || url.searchParams.get('trigger') === 'test';
  
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const querySecret = url.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && !isManual) {
    if (cronSecretHeader !== expectedSecret && querySecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }
  }

  const adminSupabase = getAdminClient();
  const nowISO = new Date().toISOString();

  // Configure VAPID for Web Push
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@agendarecap.com';

  if (vapidPublic && vapidPrivate) {
    try {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    } catch (e) {
      console.warn('[CHECK-REMINDERS] VAPID setup warning:', e);
    }
  }

  try {
    // 1. Fetch All Active Device Push Subscribers
    const { data: subscribers, error: subErr } = await adminSupabase
      .from('push_subscribers')
      .select('*');

    if (subErr) {
      console.error('[CHECK-REMINDERS] Error fetching push subscribers:', subErr);
    }

    const activeSubs = subscribers || [];

    // 2. Query Pending Reminders: reminder_datetime <= NOW() AND is_triggered == false
    let dueReminders: any[] = [];
    const { data: mainReminders, error: remErr } = await adminSupabase
      .from('reminders')
      .select('*')
      .lte('reminder_datetime', nowISO)
      .eq('is_triggered', false)
      .eq('is_active', true);

    if (mainReminders && mainReminders.length > 0) {
      dueReminders.push(...mainReminders);
    }

    if (remErr || dueReminders.length === 0) {
      // Fallback query checking scheduled_at <= NOW() and status == 'scheduled'
      const { data: fallbackReminders } = await adminSupabase
        .from('reminders')
        .select('*')
        .lte('scheduled_at', nowISO)
        .in('status', ['scheduled', 'snoozed'])
        .eq('is_active', true);

      if (fallbackReminders && fallbackReminders.length > 0) {
        dueReminders.push(...fallbackReminders);
      }
    }

    const remindersToProcess = dueReminders || [];
    let sentCount = 0;

    for (const rem of remindersToProcess) {
      const reminderId = rem.id;
      const agendaId = rem.agenda_id || null;
      const title = rem.title || 'Pengingat AgendaRecap';
      const body = rem.body || `Waktu pengingat Anda telah tiba!`;

      // Filter target subscribers for the user
      const targetSubs = activeSubs.filter(s => !rem.user_id || s.user_id === rem.user_id || activeSubs.length === 1);
      const subsToSend = targetSubs.length > 0 ? targetSubs : activeSubs;

      const payload = JSON.stringify({
        type: 'reminder',
        reminderId,
        agendaId,
        title,
        body,
        reminder_datetime: rem.reminder_datetime || rem.scheduled_at,
        actions: [
          { action: 'close', title: '❌ SELESAI' },
          { action: 'snooze_5', title: '⏱ TUNDA 5 MNT' },
          { action: 'snooze_15', title: '⏱ TUNDA 15 MNT' }
        ]
      });

      let pushDelivered = false;

      for (const sub of subsToSend) {
        // Send WebPush
        if (sub.subscription && vapidPublic && vapidPrivate) {
          try {
            await webpush.sendNotification(sub.subscription, payload);
            pushDelivered = true;
            sentCount++;
          } catch (pushErr: any) {
            console.warn(`[CHECK-REMINDERS] WebPush error endpoint=${sub.endpoint?.substring(0, 20)}:`, pushErr.message);
            if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
              await adminSupabase.from('push_subscribers').delete().eq('endpoint', sub.endpoint);
            }
          }
        }

        // Send direct FCM push payload if fcm_token or fcmServerKey exists
        const fcmToken = sub.fcm_token || sub.subscription?.fcm_token;
        const fcmServerKey = process.env.FCM_SERVER_KEY;

        if (fcmToken && fcmServerKey) {
          try {
            const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${fcmServerKey}`
              },
              body: JSON.stringify({
                to: fcmToken,
                priority: 'high',
                data: {
                  title,
                  body,
                  reminderId,
                  agendaId,
                  url: agendaId ? `/consultation?id=${agendaId}` : '/reminders'
                }
              })
            });
            if (fcmRes.ok) pushDelivered = true;
          } catch (fcmErr: any) {
            console.warn('[CHECK-REMINDERS] FCM push error:', fcmErr.message);
          }
        }
      }

      // Mark reminder as is_triggered = true and status = 'sent'
      await adminSupabase
        .from('reminders')
        .update({
          is_triggered: true,
          status: 'sent',
          updated_at: nowISO
        })
        .eq('id', reminderId);
    }

    return NextResponse.json({
      success: true,
      checkedAt: nowISO,
      foundCount: remindersToProcess.length,
      sentCount
    });

  } catch (err: any) {
    console.error('[CHECK-REMINDERS] Exception during reminder processing:', err);
    return NextResponse.json({ error: err.message, success: false }, { status: 500 });
  }
}
