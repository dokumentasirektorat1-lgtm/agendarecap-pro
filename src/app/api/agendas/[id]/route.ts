import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// GET /api/agendas/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const client = user ? supabase : getAdminClient();
    const { data, error } = await client
      .from('agendas')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Agenda not found' }, { status: 404 });
    }

    return NextResponse.json({ agenda: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/agendas/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const updates = await request.json();
    const { created_at, id: bodyId, user_id, ...safeUpdates } = updates;
    safeUpdates.updated_at = new Date().toISOString();

    const client = user ? supabase : getAdminClient();
    const { data, error } = await client
      .from('agendas')
      .update(safeUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ agenda: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/agendas/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const client = user ? supabase : getAdminClient();
    const { error } = await client
      .from('agendas')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
