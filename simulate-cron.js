const http = require('http');

const PID = process.pid;
const INSTANCE_ID = "local-dev";

console.log("==========================================================");
console.log(` [SCHEDULER] Instance=${INSTANCE_ID} PID=${PID}`);
console.log(` [SCHEDULER] Single process polling active for /api/push/cron`);
console.log(` Polling interval: 10 seconds`);
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
          console.log(`[SCHEDULER PID=${PID} ${timeStr}] 🎯 FOUND & PROCESSED: ${data.foundCount} due reminders! Success Push: ${data.successPushCount}`);
          if (data.logs && Array.isArray(data.logs)) {
            data.logs.forEach(l => console.log(`   ${l}`));
          }
        } else {
          console.log(`[SCHEDULER PID=${PID} ${timeStr}] Checked - No due reminders. (Timestamp: ${data.checkedAt})`);
        }
      } catch (e) {
        console.log(`[SCHEDULER PID=${PID} ${timeStr}] Response:`, rawData);
      }
    });
  }).on('error', (err) => {
    console.error(`[SCHEDULER PID=${PID} ${timeStr}] ❌ Failed to reach http://localhost:3000: ${err.message}`);
  });
}

// Initial trigger
triggerCron();

// Single interval instance
setInterval(triggerCron, 10000);
