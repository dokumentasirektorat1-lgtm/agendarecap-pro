-- SQL Schema Setup for Production-Ready Reminders & Web Push Subscriptions

-- 1. Create enum for reminder status if not exists
DO $$ BEGIN
    CREATE TYPE reminder_status AS ENUM ('scheduled', 'sent', 'snoozed', 'completed', 'dismissed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    time TEXT DEFAULT '08:00',
    scheduled_at TIMESTAMPTZ NOT NULL,
    timezone TEXT DEFAULT 'Asia/Jakarta',
    status TEXT DEFAULT 'scheduled',
    snoozed_until TIMESTAMPTZ,
    frequency TEXT DEFAULT 'once',
    days_of_week INT[],
    notification_tag TEXT,
    sound TEXT DEFAULT 'default',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for ultra-fast query matching in Vercel Cron
CREATE INDEX IF NOT EXISTS idx_reminders_cron ON reminders (status, scheduled_at) WHERE status IN ('scheduled', 'snoozed');
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders (user_id);

-- 3. Create push_subscribers table
CREATE TABLE IF NOT EXISTS push_subscribers (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT,
    auth TEXT,
    subscription JSONB NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_info JSONB,
    reminders JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscribers_user ON push_subscribers (user_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscribers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for reminders
DROP POLICY IF EXISTS "Users can manage their own reminders" ON reminders;
CREATE POLICY "Users can manage their own reminders" ON reminders
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. RLS Policies for push_subscribers
DROP POLICY IF EXISTS "Users can manage their push subscriptions" ON push_subscribers;
CREATE POLICY "Users can manage their push subscriptions" ON push_subscribers
    FOR ALL USING (user_id IS NULL OR auth.uid() = user_id)
    WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
