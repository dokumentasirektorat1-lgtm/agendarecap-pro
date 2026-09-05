-- Database Schema Migration: Reminder Occurrences & Multi-Device Subscriptions
-- File: supabase/migrations/20260905_reminder_occurrences.sql

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE reminder_status AS ENUM ('scheduled', 'processing', 'sent', 'snoozed', 'completed', 'dismissed', 'cancelled', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE delivery_mode AS ENUM ('hybrid', 'server', 'local');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Base Reminders Table (Definitions)
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure ALL columns exist on `reminders` table
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS time TEXT DEFAULT '08:00';
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Jakarta';
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'once';
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS days_of_week INT[];
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS sound TEXT DEFAULT 'default';
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS delivery_mode TEXT DEFAULT 'hybrid';

-- 3. Reminder Occurrences Table (Individual Executions / Trigger Points)
CREATE TABLE IF NOT EXISTS reminder_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_id UUID REFERENCES reminders(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'scheduled' NOT NULL,
    snoozed_until TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    notification_tag TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create `push_subscribers` table for Multi-Device Web Push
CREATE TABLE IF NOT EXISTS push_subscribers (
    endpoint TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    p256dh TEXT,
    auth TEXT,
    subscription JSONB NOT NULL,
    device_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_occurrences_cron ON reminder_occurrences (status, scheduled_at) WHERE status IN ('scheduled', 'snoozed');
CREATE INDEX IF NOT EXISTS idx_occurrences_reminder ON reminder_occurrences (reminder_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_user ON reminder_occurrences (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscribers_user ON push_subscribers (user_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscribers ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DROP POLICY IF EXISTS "Users can manage their own reminders" ON reminders;
CREATE POLICY "Users can manage their own reminders" ON reminders
    FOR ALL USING (auth.uid() = user_id OR user_id IS NULL)
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can manage their own occurrences" ON reminder_occurrences;
CREATE POLICY "Users can manage their own occurrences" ON reminder_occurrences
    FOR ALL USING (auth.uid() = user_id OR user_id IS NULL)
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can manage push subscriptions" ON push_subscribers;
CREATE POLICY "Users can manage push subscriptions" ON push_subscribers
    FOR ALL USING (auth.uid() = user_id OR user_id IS NULL)
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 8. Atomic Claim Function for Vercel Cron
CREATE OR REPLACE FUNCTION claim_due_occurrences(target_now TIMESTAMPTZ, fetch_limit INT DEFAULT 50)
RETURNS SETOF reminder_occurrences
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE reminder_occurrences
    SET status = 'processing',
        updated_at = NOW()
    WHERE id IN (
        SELECT id
        FROM reminder_occurrences
        WHERE (status = 'scheduled' OR status = 'snoozed')
          AND (
            (status = 'scheduled' AND scheduled_at <= target_now)
            OR (status = 'snoozed' AND snoozed_until <= target_now)
          )
        ORDER BY scheduled_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT fetch_limit
    )
    RETURNING *;
END;
$$;
