-- Habilita trial grátis de 7 dias por tenant
-- Execute no SQL Editor do Supabase.

begin;

-- trial_ends_at já pode existir; garante colunas mínimas
alter table if exists public.tenants
  add column if not exists trial_started_at timestamptz null,
  add column if not exists trial_ends_at timestamptz null;

-- (opcional) status de assinatura
alter table if exists public.tenants
  add column if not exists subscription_status text null;

-- (opcional) índice para consultas/admin
create index if not exists tenants_trial_ends_at_idx
  on public.tenants (trial_ends_at);

commit;
