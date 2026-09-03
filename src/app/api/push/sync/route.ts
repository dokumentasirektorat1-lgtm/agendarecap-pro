import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Using service role key for direct DB access
);

export async function POST(request: Request) {
  try {
    const { subscription, reminders } = await request.json();
    
    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing subscription endpoint' }, { status: 400 });
    }

    // Get the user's timezone offset from frontend to calculate accurate push times later
    // Alternatively, we can calculate everything in frontend, but backend needs to know it.
    // For now, let's just save it.
    const { error } = await supabase
      .from('push_subscribers')
      .upsert({ 
        endpoint: subscription.endpoint, 
        subscription, 
        reminders 
      });

    if (error) {
      // If table doesn't exist yet, we catch and return gracefully so frontend doesn't crash
      console.error("Supabase upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
