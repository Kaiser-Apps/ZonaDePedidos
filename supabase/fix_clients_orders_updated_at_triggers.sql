-- Fix: deleting/updating clients/orders fails with
--   record "new" has no field "updated_at"
-- This happens when updated_at column was dropped but an old trigger still references it.
--
-- Run in Supabase SQL Editor.

begin;

-- Drop any custom triggers on public.clients/public.orders whose trigger function mentions updated_at.
-- We filter on function definition text to avoid needing to know trigger names.
DO $$
DECLARE
  tr record;
BEGIN
  FOR tr IN (
    SELECT
      c.relname as table_name,
      t.tgname as trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('clients', 'orders')
      AND NOT t.tgisinternal
      AND (
        pg_get_triggerdef(t.oid) ILIKE '%updated_at%'
        OR pg_get_functiondef(t.tgfoid) ILIKE '%updated_at%'
      )
  ) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', tr.trigger_name, tr.table_name);
  END LOOP;
END $$;

-- Optional: if you prefer, instead of dropping triggers you can re-add the column.
-- (Uncomment if needed)
-- alter table public.clients add column if not exists updated_at timestamptz default now();
-- alter table public.orders add column if not exists updated_at timestamptz default now();

commit;
