import { NextResponse } from 'next/server';
import webpush from 'web-push';

export const dynamic = 'force-static';

export async function POST(request: Request) {
  try {
    const { subscription, delayMs = 3000 } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing push subscription endpoint' }, { status: 400 });
    }

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@agendarecap.com';

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ error: 'VAPID Keys not configured in environment variables' }, { status: 500 });
    }

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublic,
      vapidPrivate
    );

    const testReminderId = `test-${Date.now()}`;
    const testOccurrenceId = `occ-test-${Date.now()}`;
    const notificationTag = `reminder-${testReminderId}-occurrence-${testOccurrenceId}`;

    // STRICTLY NO OPEN ACTION! ONLY CLOSE & SNOOZE (5 MIN / 15 MIN / 1 HOUR)
    const payload = JSON.stringify({
      reminderId: testReminderId,
      occurrenceId: testOccurrenceId,
      notificationTag,
      title: '🔔 Uji Push Notification AgendaRecap',
      body: 'Notifikasi server Web Push berhasil diterima walau tab browser ditutup! (Aksi: CLOSE & SNOOZE)',
      actions: [
        { action: 'close', title: '❌ CLOSE' },
        { action: 'snooze_5', title: '⏱ 5 MIN' },
        { action: 'snooze_15', title: '⏱ 15 MIN' },
        { action: 'snooze_60', title: '⏱ 1 HOUR' }
      ]
    });

    if (delayMs <= 0) {
      await webpush.sendNotification(subscription, payload);
    } else {
      setTimeout(async () => {
        try {
          await webpush.sendNotification(subscription, payload);
        } catch (err) {
          console.error('Failed to send delayed test push notification:', err);
        }
      }, delayMs);
    }

    return NextResponse.json({
      success: true,
      message: delayMs > 0 ? `Test Push scheduled in ${delayMs / 1000}s` : 'Test Push sent immediately'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
