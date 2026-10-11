import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { sanitizeShareAgendas } from '@/lib/share-sanitizer';

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
    let startDate: string | undefined;
    let endDate: string | undefined;
    let search: string | undefined;

    try {
      const url = new URL(request.url);
      startDate = url.searchParams.get('startDate') || undefined;
      endDate = url.searchParams.get('endDate') || undefined;
      search = url.searchParams.get('search') || undefined;
    } catch (_) {}

    const client = getAdminClient();

    let query = client.from('agendas').select('*').eq('isShareable', true);

    // If token is a specific ISO date prefix like YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      const startIso = `${token}T00:00:00.000Z`;
      const endIso = `${token}T23:59:59.999Z`;
      query = query.or(`and(scheduled_at.gte.${startIso},scheduled_at.lte.${endIso}),status.eq.unscheduled,time_mode.eq.unscheduled`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sanitize data: Strictly strip privateNotes and unshared notes via canonical sanitizer
    const publicAgendas = sanitizeShareAgendas(data || [], {
      startDate,
      endDate,
      search
    });

    return NextResponse.json({ agendas: publicAgendas, token });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
