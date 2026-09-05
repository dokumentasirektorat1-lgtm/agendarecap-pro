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
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const adminSupabase = getAdminClient();
    
    // Check ownership if user authenticated
    if (user) {
      const { data: existing } = await adminSupabase
        .from('reminders')
        .select('user_id')
        .eq('id', id)
        .single();

      if (existing && existing.user_id && existing.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

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
    }

    const { data, error } = await adminSupabase
      .from('reminders')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reminder: data });
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

    const { error } = await adminSupabase
      .from('reminders')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
