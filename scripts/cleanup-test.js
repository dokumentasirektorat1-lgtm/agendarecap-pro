const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
let env = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v) env[k.trim()] = v.join('=').trim();
  });
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || 'https://qizsddkgzwixwrkbvalr.supabase.co';
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function cleanup() {
  const now = new Date().toISOString();
  console.log(`==========================================================`);
  console.log(` [CLEANUP] Emergency Development Test Reminder Cleanup`);
  console.log(` Timestamp: ${now}`);
  console.log(`==========================================================\n`);

  // 1. Cancel primary table reminders
  try {
    const { data, error } = await supabase
      .from('reminders')
      .update({ status: 'cancelled', is_active: false, updated_at: now })
      .or('status.eq.scheduled,status.eq.processing,status.eq.snoozed');

    if (error) {
      console.log(`Notice (reminders table): ${error.message}`);
    } else {
      console.log(`✓ Primary 'reminders' table active reminders marked as 'cancelled'`);
    }
  } catch (e) {
    console.log(`Notice: ${e.message}`);
  }

  // 2. Clear push_subscribers.reminders JSON array
  try {
    const { data: subs, error } = await supabase.from('push_subscribers').select('*');
    if (!error && subs) {
      for (const sub of subs) {
        if (Array.isArray(sub.reminders)) {
          const updatedList = sub.reminders.map(r => ({
            ...r,
            status: 'cancelled',
            isActive: false,
            updatedAt: now
          }));
          await supabase
            .from('push_subscribers')
            .update({ reminders: updatedList })
            .eq('endpoint', sub.endpoint);
        }
      }
      console.log(`✓ Cleared stale JSON reminders for ${subs.length} push subscribers`);
    }
  } catch (e) {
    console.log(`Notice JSON clear: ${e.message}`);
  }

  console.log(`\n✅ Emergency Cleanup Complete! All stale test reminders have been cancelled.`);
  console.log(`Old test notifications will NO LONGER be resent by the scheduler.`);
}

cleanup();
