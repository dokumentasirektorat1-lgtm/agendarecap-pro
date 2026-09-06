import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// GET /api/agendas - Fetch user agendas
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    let agendas = [];
    if (user) {
      const { data, error } = await supabase
        .from('agendas')
        .select('*')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      agendas = data || [];
    } else {
      // Admin client fallback for service context
      const adminSupabase = getAdminClient();
      const { data, error } = await adminSupabase
        .from('agendas')
        .select('*')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      agendas = data || [];
    }

    return NextResponse.json({ agendas });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch agendas' }, { status: 500 });
  }
}

// POST /api/agendas - Create a new agenda item
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const {
      title,
      location,
      scheduled_at,
      notes,
      privateNotes,
      status,
      isShareable,
      isOnline,
      onlineLink,
      meetingId,
      meetingPasscode,
      include_notes_in_share,
      groupId
    } = body;

    if (!title || !scheduled_at) {
      return NextResponse.json({ error: 'Title and scheduled_at are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newAgenda = {
      id: body.id || crypto.randomUUID(),
      user_id: user?.id || body.user_id,
      title: title.trim(),
      location: location || '',
      scheduled_at,
      notes: notes || '',
      privateNotes: privateNotes || '',
      status: status || 'confirmed',
      isShareable: isShareable !== undefined ? isShareable : true,
      isOnline: isOnline || false,
      onlineLink: onlineLink || '',
      meetingId: meetingId || '',
      meetingPasscode: meetingPasscode || '',
      include_notes_in_share: include_notes_in_share || false,
      groupId: groupId || null,
      is_completed: false,
      created_at: now,
      updated_at: now
    };

    const client = user ? supabase : getAdminClient();
    const { data, error } = await client
      .from('agendas')
      .upsert(newAgenda)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ agenda: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create agenda' }, { status: 500 });
  }
}
