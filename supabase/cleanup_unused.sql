-- Cleanup / schema-minify for pedidos-saas
-- Goal: keep only tables + columns actually used by the app code.
-- Safe to re-run (uses IF EXISTS / IF NOT EXISTS).
--
-- IMPORTANT:
-- 1) This script DROPS a few unused columns.
-- 2) This script also ADDS a few columns that the app code currently uses
--    but are missing from the schema you pasted.
-- 3) "Aggressive" mode: you said you don't use extra fields, so we also
--    remove audit/legacy columns that are not referenced by the app.
--
-- Run in Supabase SQL Editor.

begin;

-- =========================
-- 1) ADD columns that the app uses
-- =========================

-- clients: app uses created_by/updated_by (see ClientesPanel/PedidosPanel)
alter table public.clients
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- orders: app uses created_by/updated_by (see PedidosPanel)
alter table public.orders
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- asaas_subscriptions: app upserts these fields (webhook + sync)
alter table public.asaas_subscriptions
  add column if not exists payment_link_name text,
  add column if not exists last_payment_value numeric,
  add column if not exists billing_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists last_payment_id text,
  add column if not exists last_invoice_url text;

-- NOTE: some repos have last_payment_date as date, others as timestamp.
-- The app writes ISO strings; Postgres will coerce when possible.
-- If you want to normalize it, do it in a separate migration.


-- =========================
-- 2) DROP columns not used by pedidos-saas
-- =========================

-- profiles.full_name is not referenced (register route even keeps it commented)
alter table public.profiles
  drop column if exists full_name;

-- tenants recurring-link columns are not referenced (app uses env links)
alter table public.tenants
  drop column if exists asaas_recurring_link_id,
  drop column if exists asaas_recurring_link_url;

-- Aggressive cleanup: drop audit columns that the app does not read.
-- NOTE: keep created_at where the UI/API selects it (clients/orders).

-- tenants: app never selects tenants.created_at
alter table public.tenants
  drop column if exists created_at;

-- asaas_customers: app never selects created_at
alter table public.asaas_customers
  drop column if exists created_at;

-- subscriptions: descontinuada (fonte de verdade agora é asaas_subscriptions)
-- Só rode este DROP depois que o app estiver 100% sem referências a public.subscriptions.
drop table if exists public.subscriptions cascade;

-- asaas_subscriptions: app writes updated_at but never reads created_at
alter table public.asaas_subscriptions
  drop column if exists created_at;

-- asaas_payments: app writes/uses updated_at but never reads created_at
alter table public.asaas_payments
  drop column if exists created_at;

-- clients/orders: app does not use updated_at columns
-- NOTE: if your schema has an old trigger that sets updated_at, dropping the column
-- without dropping the trigger will break DELETE/UPDATE with:
--   record "new" has no field "updated_at"
-- This block removes any such triggers only on clients/orders.
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

alter table public.clients
  drop column if exists updated_at;

alter table public.orders
  drop column if exists updated_at;

-- promo_codes: app/RPC does not require created_at
alter table public.promo_codes
  drop column if exists created_at;


-- =========================
-- 3) (Optional) sanity checks
-- =========================
-- Uncomment to quickly inspect remaining columns.
-- select table_name, column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in (
--     'profiles','tenants','subscriptions','asaas_customers','asaas_subscriptions','asaas_payments',
--     'orders','clients','promo_codes','promo_redemptions'
--   )
-- order by table_name, ordinal_position;

commit;
