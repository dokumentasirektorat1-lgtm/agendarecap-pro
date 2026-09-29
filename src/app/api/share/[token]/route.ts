import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

export const revalidate = 0;
export function generateStaticParams() { return [{ token: 'placeholder' }]; }

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// GET /api/share/[token] - Public read-only agenda endpoint (No login required)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const client = getAdminClient();

    let query = client.from('agendas').select('*').eq('isShareable', true);

    // If token is a specific ISO date prefix like YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      const startIso = `${token}T00:00:00.000Z`;
      const endIso = `${token}T23:59:59.999Z`;
      query = query.or(`scheduled_at.gte.${startIso},scheduled_at.lte.${endIso},status.eq.unscheduled,time_mode.eq.unscheduled`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sanitize data: Strictly strip privateNotes and unshared notes
    const publicAgendas = (data || []).map(a => ({
      id: a.id,
      title: a.title,
      location: a.location || '',
      scheduled_at: a.scheduled_at,
      time_mode: a.time_mode || undefined,
      status: a.status || 'confirmed',
      is_completed: Boolean(a.is_completed),
      isOnline: Boolean(a.isOnline),
      onlineLink: a.onlineLink || '',
      meetingId: a.meetingId || '',
      meetingPasscode: a.meetingPasscode || '',
      notes: a.include_notes_in_share ? (a.notes || '') : undefined,
      isShareable: true
    }));

    return NextResponse.json({ agendas: publicAgendas, token });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
