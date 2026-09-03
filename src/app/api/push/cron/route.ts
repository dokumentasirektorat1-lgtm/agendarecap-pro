import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export async function GET(request: Request) {
  // Authentication for cron if needed
  // This endpoint gets hit periodically by Vercel Cron
  
  try {
    const { data: subscribers, error } = await supabase
      .from('push_subscribers')
      .select('*');

    if (error || !subscribers) {
      return NextResponse.json({ error: error?.message }, { status: 500 });
    }

    const now = new Date();
    // Get typical UTC time, to evaluate localized time we must assume the device timezone.
    // For simplicity, since the app assumes GMT+7 implicitly for Agendaku defaults, we'll convert to GMT+7.
    // A robust version would save user's timezone offset in DB.
    
    // Create current time in GMT+7 for checking
    const gmt7Time = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const currentHHmm = `${gmt7Time.getUTCHours().toString().padStart(2, '0')}:${gmt7Time.getUTCMinutes().toString().padStart(2, '0')}`;
    const dayOfWeek = gmt7Time.getUTCDay();

    let pushPromises: Promise<any>[] = [];

    for (const sub of subscribers) {
      if (!sub.reminders || !Array.isArray(sub.reminders)) continue;

      for (const r of sub.reminders) {
        if (!r.isActive) continue;
        if (r.time !== currentHHmm) continue;

        let shouldNotify = false;
        if (r.frequency === 'once') {
          // Assume today
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
          pushPromises.push(
            webpush.sendNotification(
              sub.subscription,
              JSON.stringify({
                title: r.title,
                body: "Pengingat Personal AgendaRecap (Server Push)",
                url: "/"
              })
            ).catch(err => {
              if (err.statusCode === 404 || err.statusCode === 410) {
                // Subscription has expired or is no longer valid, delete it
                return supabase.from('push_subscribers').delete().eq('endpoint', sub.endpoint);
              }
            })
          );
        }
      }
    }

    await Promise.all(pushPromises);
    
    return NextResponse.json({ success: true, processed: pushPromises.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
