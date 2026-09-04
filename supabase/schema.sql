-- 1. Tabel Profiles 
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user' NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabel Agendas
CREATE TABLE IF NOT EXISTS public.agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  include_notes_in_share BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'confirmed',
  "privateNotes" TEXT,
  "isShareable" BOOLEAN DEFAULT true,
  "groupId" UUID,
  "isOnline" BOOLEAN DEFAULT false,
  "onlineLink" TEXT,
  "meetingId" TEXT,
  "meetingPasscode" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabel Reminders (Cross-Device Personal Reminders)
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  time TEXT NOT NULL,
  frequency TEXT DEFAULT 'daily' NOT NULL,
  sound TEXT DEFAULT 'default',
  is_active BOOLEAN DEFAULT true NOT NULL,
  days_of_week INTEGER[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabel Push Subscribers (Web Push Notifications)
CREATE TABLE IF NOT EXISTS public.push_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  reminders JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Mengaktifkan Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscribers ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "User can view own profile" ON public.profiles FOR SELECT USING ( auth.uid() = id );
CREATE POLICY "User can update own profile" ON public.profiles FOR UPDATE USING ( auth.uid() = id );

CREATE POLICY "Users can manage own agendas" ON public.agendas FOR ALL 
USING ( auth.uid() = user_id ) WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can manage own reminders" ON public.reminders FOR ALL 
USING ( auth.uid() = user_id ) WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Anyone can register push subscriptions" ON public.push_subscribers FOR ALL 
USING ( true ) WITH CHECK ( true );

-- Trigger agar user auth otomatis masuk ke tb profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. Tabel App Settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  app_name TEXT DEFAULT 'AgendaRecap',
  app_logo TEXT,
  share_order JSONB DEFAULT '["title", "time", "location"]'::jsonb,
  is_watermark_enabled BOOLEAN DEFAULT true,
  watermark_text TEXT DEFAULT 'Dibuat oleh AgendaRecap Pro',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own app settings" 
ON public.app_settings FOR ALL 
USING ( auth.uid() = user_id )
WITH CHECK ( auth.uid() = user_id );

-- Trigger Settings Otomatis
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_settings (user_id)
  VALUES (new.id);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_settings();
