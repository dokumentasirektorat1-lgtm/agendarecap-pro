const http = require('http');

console.log("==========================================================");
console.log(" [REMINDER] Local Development Scheduler Runner Active");
console.log(" Polling /api/push/cron every 10 seconds");
console.log(" Make sure 'npm run dev' is running on http://localhost:3000");
console.log(" Press Ctrl+C to stop.");
console.log("==========================================================\n");

function triggerCron() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID');
  
  http.get('http://localhost:3000/api/push/cron', (res) => {
    let rawData = '';
    res.on('data', (chunk) => rawData += chunk);
    res.on('end', () => {
      try {
        const data = JSON.parse(rawData);
        if (data.foundCount > 0) {
          console.log(`[REMINDER Scheduler ${timeStr}] 🎯 FOUND & PROCESSED: ${data.foundCount} due reminders! Success Push: ${data.successPushCount}`);
          if (data.logs && Array.isArray(data.logs)) {
            data.logs.forEach(l => console.log(`   ${l}`));
          }
        } else {
          console.log(`[REMINDER Scheduler ${timeStr}] Checked - No due reminders. (Timestamp: ${data.checkedAt})`);
        }
      } catch (e) {
        console.log(`[REMINDER Scheduler ${timeStr}] Response:`, rawData);
      }
    });
  }).on('error', (err) => {
    console.error(`[REMINDER Scheduler ${timeStr}] ❌ Failed to reach http://localhost:3000 (Ensure 'npm run dev' is running): ${err.message}`);
  });
}

// Initial trigger
triggerCron();

// Poll every 10 seconds for local development
setInterval(triggerCron, 10000);
