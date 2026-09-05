import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

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
    const { data: reminder, error } = await adminSupabase
      .from('reminders')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    return NextResponse.json({ reminder });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/reminders/:id - Update reminder
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const adminSupabase = getAdminClient();

    const payload: any = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) payload.title = body.title;
    if (body.body !== undefined) payload.body = body.body;
    if (body.time !== undefined) payload.time = body.time;
    if (body.scheduledAt !== undefined) payload.scheduled_at = body.scheduledAt;
    if (body.scheduled_at !== undefined) payload.scheduled_at = body.scheduled_at;
    if (body.timezone !== undefined) payload.timezone = body.timezone;
    if (body.status !== undefined) payload.status = body.status;
    if (body.frequency !== undefined) payload.frequency = body.frequency;
    if (body.daysOfWeek !== undefined) payload.days_of_week = body.daysOfWeek;
    if (body.sound !== undefined) payload.sound = body.sound;
    if (body.isActive !== undefined) payload.is_active = body.isActive;
    if (body.is_active !== undefined) payload.is_active = body.is_active;

    if (body.status === 'completed' || body.status === 'dismissed') {
      payload.completed_at = new Date().toISOString();
      payload.is_active = false;
    }

    let updatedData = null;
    try {
      const { data } = await adminSupabase
        .from('reminders')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (data) updatedData = data;
    } catch (e) {
      console.warn('[PATCH API] Primary table update notice:', e);
    }

    // Also sync update to push_subscribers.reminders JSON array
    try {
      const { data: subs } = await adminSupabase.from('push_subscribers').select('*');
      if (subs && subs.length > 0) {
        for (const sub of subs) {
          if (Array.isArray(sub.reminders)) {
            const updatedList = sub.reminders.map((r: any) => {
              if (r.id === id) {
                return {
                  ...r,
                  status: body.status || r.status,
                  isActive: payload.is_active !== undefined ? payload.is_active : r.isActive,
                  updatedAt: new Date().toISOString()
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
      console.warn('[PATCH API] Subscriber JSON sync notice:', e);
    }

    return NextResponse.json({ success: true, id, reminder: updatedData || { id, ...payload } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/reminders/:id - Delete reminder
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adminSupabase = getAdminClient();

    try {
      await adminSupabase
        .from('reminders')
        .delete()
        .eq('id', id);
    } catch (e) {
      console.warn('[DELETE API] Primary table notice:', e);
    }

    // Sync delete to push_subscribers JSON array
    try {
      const { data: subs } = await adminSupabase.from('push_subscribers').select('*');
      if (subs && subs.length > 0) {
        for (const sub of subs) {
          if (Array.isArray(sub.reminders)) {
            const updatedList = sub.reminders.filter((r: any) => r.id !== id);
            await adminSupabase
              .from('push_subscribers')
              .update({ reminders: updatedList })
              .eq('endpoint', sub.endpoint);
          }
        }
      }
    } catch (e) {
      console.warn('[DELETE API] Subscriber JSON sync notice:', e);
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
