import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
    
    const supabase = createClient(supabaseUrl, serviceKey);

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    
    if (vapidPublic && vapidPrivate) {
      try {
        webpush.setVapidDetails(
          'mailto:admin@agendarecap.com',
          vapidPublic,
          vapidPrivate
        );
      } catch (err) {
        console.error("Vapid setup error:", err);
      }
    }

    const { data: subscribers, error } = await supabase
      .from('push_subscribers')
      .select('*');

    if (error || !subscribers) {
      return NextResponse.json({ error: error?.message || "No subscribers or table missing" }, { status: 200 });
    }

    const now = new Date();
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

        if (shouldNotify && vapidPublic && vapidPrivate) {
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
