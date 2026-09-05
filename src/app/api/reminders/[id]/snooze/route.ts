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
    const { id: reminderId } = await params;
    const body = await request.json().catch(() => ({}));
    const minutes = Number(body.minutes) || 5; // Default snooze 5 minutes
    const occurrenceId = body.occurrenceId;

    const now = new Date();
    const newTriggerTime = new Date(now.getTime() + minutes * 60 * 1000);
    const newScheduledAtISO = newTriggerTime.toISOString();

    const hh = newTriggerTime.getHours().toString().padStart(2, '0');
    const mm = newTriggerTime.getMinutes().toString().padStart(2, '0');
    const newTime = `${hh}:${mm}`;

    const adminSupabase = getAdminClient();

    // 1. Update target occurrence status to 'snoozed' / 'scheduled' with snoozed_until timestamp
    let occUpdated = false;
    if (occurrenceId && occurrenceId !== 'unknown') {
      try {
        const { data } = await adminSupabase
          .from('reminder_occurrences')
          .update({
            status: 'snoozed',
            snoozed_until: newScheduledAtISO,
            updated_at: now.toISOString()
          })
          .eq('id', occurrenceId)
          .select()
          .single();
        if (data) occUpdated = true;
      } catch (e) {
        console.warn('[SNOOZE API] Occurrence update notice:', e);
      }
    }

    // Fallback: update latest occurrence of this reminderId if occurrenceId not specified
    if (!occUpdated) {
      try {
        await adminSupabase
          .from('reminder_occurrences')
          .update({
            status: 'snoozed',
            snoozed_until: newScheduledAtISO,
            updated_at: now.toISOString()
          })
          .eq('reminder_id', reminderId);
      } catch (e) {
        console.warn('[SNOOZE API] Occurrence fallback notice:', e);
      }
    }

    // Also update parent reminder time display for legacy views
    try {
      await adminSupabase
        .from('reminders')
        .update({
          time: newTime,
          is_active: true,
          updated_at: now.toISOString()
        })
        .eq('id', reminderId);
    } catch (e) {
      console.warn('[SNOOZE API] Reminder parent update notice:', e);
    }

    return NextResponse.json({
      success: true,
      reminderId,
      occurrenceId,
      snoozedMinutes: minutes,
      snoozedUntil: newScheduledAtISO,
      newTime
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
