import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// POST /api/push/subscribe - Register or update Web Push subscription
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { subscription, deviceInfo, reminders, fcm_token } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing push subscription endpoint' }, { status: 400 });
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh || null;
    const auth = subscription.keys?.auth || null;
    const user_id = user?.id || null;
    const now = new Date().toISOString();

    const fcmToken = fcm_token || subscription.fcm_token || null;
    if (fcmToken) {
      subscription.fcm_token = fcmToken;
    }

    const adminSupabase = getAdminClient();
    const pushPayload: any = {
      endpoint,
      p256dh,
      auth,
      subscription,
      user_id,
      last_seen_at: now
    };

    if (fcmToken) {
      pushPayload.fcm_token = fcmToken;
    }

    let { error } = await adminSupabase
      .from('push_subscribers')
      .upsert(pushPayload);

    if (error && (error as any).code === 'PGRST204') {
      console.warn('[PUSH SUBSCRIBE] PGRST204 column error detected. Retrying without top-level auth column.');
      delete pushPayload.auth;
      const retry = await adminSupabase
        .from('push_subscribers')
        .upsert(pushPayload);
      error = retry.error;
    }

    if (error) {
      console.error('[PUSH SUBSCRIBE] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[PUSH SUBSCRIBE] success | endpoint="${endpoint.substring(0, 30)}..." user_id="${user_id}"`);
    return NextResponse.json({ success: true, endpoint });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/push/subscribe - Unsubscribe device
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const adminSupabase = getAdminClient();
    const { error } = await adminSupabase
      .from('push_subscribers')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
