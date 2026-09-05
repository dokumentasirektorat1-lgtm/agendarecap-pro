import { NextResponse } from 'next/server';
import { processDueReminders } from '@/lib/reminder-service';

export async function GET(request: Request) {
  return handleCronJob(request);
}

export async function POST(request: Request) {
  return handleCronJob(request);
}

async function handleCronJob(request: Request) {
  // 1. Cron Authentication Check (Vercel Cron Header / CRON_SECRET)
  const authHeader = request.headers.get('authorization');
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret) {
    const isBearerValid = authHeader === `Bearer ${expectedSecret}`;
    const isCustomHeaderValid = cronSecretHeader === expectedSecret;

    if (!isBearerValid && !isCustomHeaderValid) {
      console.warn('[CRON API] Unauthorized cron request attempt');
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }
  }

  // 2. Process Due Reminders Engine
  try {
    const result = await processDueReminders();
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: any) {
    console.error('[CRON API] Fatal error executing reminder engine:', err);
    return NextResponse.json({ error: err.message, success: false }, { status: 500 });
  }
}
