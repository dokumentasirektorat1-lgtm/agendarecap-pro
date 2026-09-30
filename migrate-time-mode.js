// Run migration: check & guide adding time_mode column to agendas table
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Parse .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.trim().match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('[MIGRATE] Checking if time_mode column exists on agendas table...');

  const { data, error } = await supabase
    .from('agendas')
    .select('time_mode')
    .limit(1);

  if (error && error.code === 'PGRST204') {
    console.log('[MIGRATE] Column time_mode does NOT exist.');
    console.log('');
    console.log('=== YOU MUST RUN THIS SQL IN SUPABASE SQL EDITOR ===');
    console.log('');
    console.log("ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS time_mode TEXT;");
    console.log("NOTIFY pgrst, 'reload schema';");
    console.log('');
    console.log('Open: https://supabase.com/dashboard/project/qizsddkgzwixwrkbvalr/sql/new');
    console.log('======');
    process.exit(1);
  } else if (!error) {
    console.log('[MIGRATE] Column time_mode already exists! No action needed.');
  } else {
    console.error('[MIGRATE] Unexpected error:', error.message, error.code);
  }
}

migrate();
