import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// POST /api/reminders/:id/snooze
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const minutes = Number(body.minutes) || 5; // Default snooze 5 minutes

    const now = new Date();
    const newTriggerTime = new Date(now.getTime() + minutes * 60 * 1000);
    const newScheduledAtISO = newTriggerTime.toISOString();

    const hh = newTriggerTime.getHours().toString().padStart(2, '0');
    const mm = newTriggerTime.getMinutes().toString().padStart(2, '0');
    const newTime = `${hh}:${mm}`;

    const adminSupabase = getAdminClient();

    // 1. Update primary table if present
    const payload = {
      scheduled_at: newScheduledAtISO,
      snoozed_until: newScheduledAtISO,
      status: 'snoozed',
      time: newTime,
      is_active: true,
      updated_at: now.toISOString()
    };

    let updatedReminderData = null;
    try {
      const { data } = await adminSupabase
        .from('reminders')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (data) updatedReminderData = data;
    } catch (e) {
      console.warn('[SNOOZE API] Primary table notice:', e);
    }

    // 2. Sync to push_subscribers.reminders JSON array
    try {
      const { data: subs } = await adminSupabase.from('push_subscribers').select('*');
      if (subs && subs.length > 0) {
        for (const sub of subs) {
          if (Array.isArray(sub.reminders)) {
            const updatedList = sub.reminders.map((r: any) => {
              if (r.id === id) {
                return {
                  ...r,
                  scheduledAt: newScheduledAtISO,
                  status: 'snoozed',
                  time: newTime,
                  isActive: true,
                  updatedAt: now.toISOString()
                };
              }
              return r;
            });
            await adminSupabase
              .from('push_subscribers')
              .update({ reminders: updatedList })
              .eq('endpoint', sub.endpoint);
          }
        }
      }
    } catch (e) {
      console.warn('[SNOOZE API] Subscriber JSON sync notice:', e);
    }

    return NextResponse.json({
      success: true,
      reminderId: id,
      reminder: updatedReminderData,
      snoozedMinutes: minutes,
      nextTriggerAt: newScheduledAtISO,
      newTime,
      status: 'snoozed'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
