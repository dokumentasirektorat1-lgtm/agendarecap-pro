export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[SERVER SCHEDULER] Initializing Node.js Server Background Poller (15s interval)...');

    const globalObj = global as any;
    if (globalObj.__reminderSchedulerInterval) {
      clearInterval(globalObj.__reminderSchedulerInterval);
    }

    // Dynamic import to prevent premature bundle evaluation
    const { processDueReminders } = await import('@/lib/reminder-service');

    globalObj.__reminderSchedulerInterval = setInterval(async () => {
      try {
        await processDueReminders();
      } catch (err) {
        // Silent background catch
      }
    }, 15000);
  }
}
