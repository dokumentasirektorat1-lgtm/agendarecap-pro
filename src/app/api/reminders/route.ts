import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// GET /api/reminders - Fetch user reminders
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const adminSupabase = getAdminClient();
    
    // Try primary table first
    const { data: reminders, error } = await adminSupabase
      .from('reminders')
      .select('*')
      .order('scheduled_at', { ascending: true });

    if (!error && reminders) {
      return NextResponse.json({ reminders });
    }

    // Fallback: load from push_subscribers JSON
    const { data: subs } = await adminSupabase.from('push_subscribers').select('reminders');
    let fallbackReminders: any[] = [];
    if (subs && subs.length > 0) {
      subs.forEach(s => {
        if (Array.isArray(s.reminders)) {
          fallbackReminders.push(...s.reminders);
        }
      });
    }

    return NextResponse.json({ reminders: fallbackReminders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/reminders - Create a new reminder with validation
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { id, title, body: reminderBody, scheduledAt, timezone, time, frequency, sound, daysOfWeek } = body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const user_id = user?.id || null;
    const now = new Date();
    const targetScheduledAt = scheduledAt || now.toISOString();

    const reminderId = id || crypto.randomUUID();
    const notificationTag = `reminder-${reminderId}`;
    const userTimezone = timezone || 'Asia/Jakarta';

    const newReminder = {
      id: reminderId,
      user_id,
      title: title.trim(),
      body: reminderBody || `Waktu pengingat Anda (${time || 'sekarang'}) telah tiba!`,
      time: time || '08:00',
      scheduled_at: targetScheduledAt,
      timezone: userTimezone,
      status: 'scheduled',
      frequency: frequency || 'once',
      days_of_week: daysOfWeek || null,
      notification_tag: notificationTag,
      sound: sound || 'default',
      is_active: true,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const adminSupabase = getAdminClient();

    // 1. Insert into primary table if available
    let tableSuccess = false;
    try {
      const { error } = await adminSupabase
        .from('reminders')
        .insert(newReminder);
      if (!error) tableSuccess = true;
    } catch (e) {
      console.warn('[REMINDER API] Primary table insert notice:', e);
    }

    // 2. Sync to push_subscribers.reminders JSON column as fallback
    try {
      const { data: subs } = await adminSupabase.from('push_subscribers').select('*');
      if (subs && subs.length > 0) {
        for (const sub of subs) {
          const currentList = Array.isArray(sub.reminders) ? sub.reminders : [];
          const exists = currentList.some((r: any) => r.id === reminderId);
          const updatedList = exists
            ? currentList.map((r: any) => r.id === reminderId ? { ...r, ...newReminder, scheduledAt: targetScheduledAt } : r)
            : [...currentList, { ...newReminder, scheduledAt: targetScheduledAt }];

          await adminSupabase
            .from('push_subscribers')
            .update({ reminders: updatedList })
            .eq('endpoint', sub.endpoint);
        }
      }
    } catch (subErr) {
      console.warn('[REMINDER API] Subscriber JSON sync notice:', subErr);
    }

    return NextResponse.json({ reminder: newReminder, tableSynced: tableSuccess }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
