import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

export const dynamic = 'force-static';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createAdminSupabase(supabaseUrl, serviceKey);
}

// POST /api/dev/reminders/cleanup - Emergency Development Cleanup for Stale/Test Reminders
export async function POST() {
  try {
    const supabase = getAdminClient();
    const now = new Date().toISOString();
    const logs: string[] = [];

    logs.push(`[CLEANUP] Emergency cleanup initiated at ${now}`);

    // 1. Mark all pending/scheduled test reminders as 'cancelled' and 'is_active = false' in primary table
    try {
      const { data: cancelledReminders, error: remErr } = await supabase
        .from('reminders')
        .update({ status: 'cancelled', is_active: false, updated_at: now })
        .or('status.eq.scheduled,status.eq.processing,status.eq.snoozed')
        .select();

      if (remErr) {
        logs.push(`[CLEANUP] Primary table cleanup notice: ${remErr.message}`);
      } else {
        logs.push(`[CLEANUP] Cancelled ${cancelledReminders?.length || 0} active reminders in primary table`);
      }
    } catch (e: any) {
      logs.push(`[CLEANUP] Primary table exception: ${e.message}`);
    }

    // 2. Clean up push_subscribers.reminders JSON array
    try {
      const { data: subs, error: subErr } = await supabase
        .from('push_subscribers')
        .select('*');

      if (!subErr && subs) {
        let cleanedSubCount = 0;
        for (const sub of subs) {
          if (Array.isArray(sub.reminders) && sub.reminders.length > 0) {
            const updatedList = sub.reminders.map((r: any) => ({
              ...r,
              status: 'cancelled',
              isActive: false,
              updatedAt: now
            }));

            await supabase
              .from('push_subscribers')
              .update({ reminders: updatedList })
              .eq('endpoint', sub.endpoint);
            cleanedSubCount++;
          }
        }
        logs.push(`[CLEANUP] Cleared stale JSON reminders for ${cleanedSubCount} push subscribers`);
      }
    } catch (e: any) {
      logs.push(`[CLEANUP] Push subscribers JSON cleanup exception: ${e.message}`);
    }

    return NextResponse.json({
      success: true,
      timestamp: now,
      logs
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
