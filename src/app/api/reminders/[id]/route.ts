import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { generateNextOccurrence } from '@/lib/reminder-service';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// GET /api/reminders/:id
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adminSupabase = getAdminClient();
    const { data: reminder } = await adminSupabase
      .from('reminders')
      .select('*')
      .eq('id', id)
      .single();

    const { data: occurrences } = await adminSupabase
      .from('reminder_occurrences')
      .select('*')
      .eq('reminder_id', id);

    if (!reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    return NextResponse.json({ reminder, occurrences: occurrences || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/reminders/:id - Update reminder or occurrence state
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reminderId } = await params;
    const body = await request.json();
    const occurrenceId = body.occurrenceId;
    const adminSupabase = getAdminClient();

    const nowISO = new Date().toISOString();
    const targetStatus = body.status;

    // 1. Update target occurrence status if specified
    let targetOccScheduledAt = nowISO;
    if (occurrenceId && occurrenceId !== 'unknown') {
      const { data: occData } = await adminSupabase
        .from('reminder_occurrences')
        .update({
          status: targetStatus || 'completed',
          completed_at: targetStatus === 'completed' ? nowISO : undefined,
          dismissed_at: targetStatus === 'dismissed' ? nowISO : undefined,
          updated_at: nowISO
        })
        .eq('id', occurrenceId)
        .select()
        .single();

      if (occData) {
        targetOccScheduledAt = occData.scheduled_at;
      }
    } else {
      // Update all non-completed occurrences of this reminderId
      await adminSupabase
        .from('reminder_occurrences')
        .update({
          status: targetStatus || 'completed',
          completed_at: targetStatus === 'completed' ? nowISO : undefined,
          dismissed_at: targetStatus === 'dismissed' ? nowISO : undefined,
          updated_at: nowISO
        })
        .eq('reminder_id', reminderId)
        .in('status', ['scheduled', 'processing', 'sent', 'snoozed']);
    }

    // 2. If occurrence CLOSE / completed, trigger next occurrence if recurring
    if (targetStatus === 'completed' || targetStatus === 'dismissed') {
      await generateNextOccurrence(reminderId, targetOccScheduledAt);
    }

    // 3. Update parent reminder definition
    const rPayload: any = { updated_at: nowISO };
    if (body.title !== undefined) rPayload.title = body.title;
    if (body.body !== undefined) rPayload.body = body.body;
    if (body.time !== undefined) rPayload.time = body.time;
    if (body.frequency !== undefined) rPayload.frequency = body.frequency;
    if (body.isActive !== undefined) rPayload.is_active = body.isActive;

    await adminSupabase
      .from('reminders')
      .update(rPayload)
      .eq('id', reminderId);

    return NextResponse.json({ success: true, reminderId, status: targetStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/reminders/:id - Delete reminder & all occurrences
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reminderId } = await params;
    const adminSupabase = getAdminClient();

    // Delete parent reminder (Cascades to occurrences via DB FK ON DELETE CASCADE)
    await adminSupabase.from('reminders').delete().eq('id', reminderId);
    await adminSupabase.from('reminder_occurrences').delete().eq('reminder_id', reminderId);

    return NextResponse.json({ success: true, reminderId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
