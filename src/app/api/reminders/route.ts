import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-static';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// GET /api/reminders - Fetch user reminders & occurrences
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const adminSupabase = getAdminClient();

    const { data: reminders, error: rErr } = await adminSupabase
      .from('reminders')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: occurrences, error: oErr } = await adminSupabase
      .from('reminder_occurrences')
      .select('*')
      .order('scheduled_at', { ascending: true });

    return NextResponse.json({
      reminders: reminders || [],
      occurrences: occurrences || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/reminders - Create a new reminder & initial occurrence
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { id, title, body: reminderBody, scheduledAt, time, timezone, frequency, sound, daysOfWeek, deliveryMode } = body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const user_id = user?.id || null;
    const now = new Date();
    const targetScheduledAt = scheduledAt || now.toISOString();

    const reminderId = id || crypto.randomUUID();
    const occurrenceId = crypto.randomUUID();
    const notificationTag = `reminder-${reminderId}-occurrence-${occurrenceId}`;
    const userTimezone = timezone || 'Asia/Jakarta';

    const newReminder = {
      id: reminderId,
      user_id,
      title: title.trim(),
      body: reminderBody || '',
      time: time || '08:00',
      timezone: userTimezone,
      frequency: frequency || 'once',
      days_of_week: daysOfWeek || null,
      sound: sound || 'default',
      is_active: true,
      delivery_mode: deliveryMode || 'hybrid',
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const initialOccurrence = {
      id: occurrenceId,
      reminder_id: reminderId,
      user_id,
      scheduled_at: targetScheduledAt,
      status: 'scheduled',
      notification_tag: notificationTag,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const adminSupabase = getAdminClient();

    // 1. Insert Reminder Definition
    try {
      await adminSupabase.from('reminders').upsert(newReminder);
    } catch (e) {
      console.warn('[REMINDER API] Primary table insert notice:', e);
    }

    // 2. Insert Initial Occurrence
    try {
      await adminSupabase.from('reminder_occurrences').upsert(initialOccurrence);
    } catch (e) {
      console.warn('[REMINDER API] Occurrence table insert notice:', e);
    }

    return NextResponse.json({
      reminder: newReminder,
      occurrence: initialOccurrence
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
