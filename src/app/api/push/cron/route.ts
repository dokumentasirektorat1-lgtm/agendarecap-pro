import { NextResponse } from 'next/server';
import { processDueReminders } from '@/lib/reminder-service';

export const dynamic = 'force-static';

export async function GET(request: Request) {
  return handleCronJob();
}

export async function POST(request: Request) {
  return handleCronJob();
}

async function handleCronJob() {
  try {
    const result = await processDueReminders();
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: any) {
    console.error('[REMINDER] Fatal error in cron route handler:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
