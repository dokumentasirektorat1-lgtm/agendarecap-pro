import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-static';
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
    const { subscription, deviceInfo, reminders } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing push subscription endpoint' }, { status: 400 });
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh || null;
    const auth = subscription.keys?.auth || null;
    const user_id = user?.id || null;
    const now = new Date().toISOString();

    const adminSupabase = getAdminClient();
    const { error } = await adminSupabase
      .from('push_subscribers')
      .upsert({
        endpoint,
        p256dh,
        auth,
        subscription,
        user_id,
        device_info: deviceInfo || null,
        reminders: reminders || null,
        last_seen_at: now
      });

    if (error) {
      console.error('API /api/push/subscribe error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
