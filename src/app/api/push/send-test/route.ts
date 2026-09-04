import { NextResponse } from 'next/server';
import webpush from 'web-push';

export async function POST(request: Request) {
  try {
    const { subscription, delayMs = 5000 } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing push subscription endpoint' }, { status: 400 });
    }

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ error: 'VAPID Keys not configured on Vercel environment variables' }, { status: 500 });
    }

    webpush.setVapidDetails(
      'mailto:admin@agendarecap.com',
      vapidPublic,
      vapidPrivate
    );

    // Run asynchronous delay before pushing notification
    setTimeout(async () => {
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            title: '🔔 Cloud Web Push Success!',
            body: 'Notifikasi server ini berhasil dikirim oleh Google FCM saat aplikasi ditutup!',
            url: '/'
          })
        );
      } catch (err) {
        console.error("Failed to send delayed push notification:", err);
      }
    }, delayMs);

    return NextResponse.json({ success: true, message: `Cloud push scheduled in ${delayMs / 1000}s` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
