import { NextResponse } from 'next/server';
import { processDueReminders } from '@/lib/reminder-service';

export async function GET(request: Request) {
  return handleCronJob(request);
}

export async function POST(request: Request) {
  return handleCronJob(request);
}

async function handleCronJob(request: Request) {
  const url = new URL(request.url);
  const isManualRequest = url.searchParams.get('manual') === 'true' || url.searchParams.get('trigger') === 'test';
  
  const authHeader = request.headers.get('authorization');
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const querySecret = url.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  // If secret is set, verify header or query secret UNLESS explicitly triggered manually from application UI
  if (expectedSecret && !isManualRequest) {
    const isBearerValid = authHeader === `Bearer ${expectedSecret}`;
    const isCustomHeaderValid = cronSecretHeader === expectedSecret;
    const isQuerySecretValid = querySecret === expectedSecret;

    if (!isBearerValid && !isCustomHeaderValid && !isQuerySecretValid) {
      console.warn('[CRON API] Unauthorized cron request attempt');
      return NextResponse.json({ error: 'Unauthorized cron request', hint: 'Pass ?manual=true or valid authorization header' }, { status: 401 });
    }
  }

  // Process Due Reminders Engine
  try {
    const result = await processDueReminders();
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: any) {
    console.error('[CRON API] Fatal error executing reminder engine:', err);
    return NextResponse.json({ error: err.message, success: false }, { status: 500 });
  }
}
