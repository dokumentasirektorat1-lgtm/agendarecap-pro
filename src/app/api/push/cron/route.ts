import { handleCronJob } from '@/app/api/cron/reminders/route';


export async function GET(request: Request) {
  return handleCronJob(request);
}

export async function POST(request: Request) {
  return handleCronJob(request);
}
