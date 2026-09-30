-- Add time_mode to agendas
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS time_mode TEXT;
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS "isUrgent" BOOLEAN DEFAULT false;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
