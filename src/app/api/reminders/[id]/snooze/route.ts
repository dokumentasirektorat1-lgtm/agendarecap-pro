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
    const minutes = Number(body.minutes) || 5; // Default snooze 5 minutes if unspecified

    const now = new Date();
    const newTriggerTime = new Date(now.getTime() + minutes * 60 * 1000);
    const newScheduledAtISO = newTriggerTime.toISOString();

    const hh = newTriggerTime.getHours().toString().padStart(2, '0');
    const mm = newTriggerTime.getMinutes().toString().padStart(2, '0');
    const newTime = `${hh}:${mm}`;

    const adminSupabase = getAdminClient();

    // 1. Fetch current reminder
    const { data: reminder, error: fetchErr } = await adminSupabase
      .from('reminders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') {
      console.error('Error fetching reminder for snooze:', fetchErr);
    }

    const payload = {
      scheduled_at: newScheduledAtISO,
      snoozed_until: newScheduledAtISO,
      status: 'snoozed',
      time: newTime,
      is_active: true,
      updated_at: now.toISOString()
    };

    if (reminder) {
      const { data, error } = await adminSupabase
        .from('reminders')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        reminder: data,
        snoozedMinutes: minutes,
        nextTriggerAt: newScheduledAtISO
      });
    }

    // If not present in DB table yet (or offline sync mode), return calculation payload for client & IDB
    return NextResponse.json({
      success: true,
      reminderId: id,
      snoozedMinutes: minutes,
      nextTriggerAt: newScheduledAtISO,
      newTime,
      status: 'snoozed'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
