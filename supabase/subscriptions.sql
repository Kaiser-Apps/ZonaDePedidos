-- Execute no SQL Editor do Supabase.
-- Modelo enxuto (mapeamento customer + assinatura como fonte de verdade)
--
-- IMPORTANTE:
-- A tabela public.subscriptions foi descontinuada.
-- A fonte de verdade agora é public.asaas_subscriptions (ver supabase/asaas_subscriptions.sql).

create table if not exists public.asaas_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asaas_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id),
  unique (asaas_customer_id),
  constraint asaas_customers_tenant_id_fkey foreign key (tenant_id) references public.tenants(id)
);

-- (Opcional) Remoção da tabela antiga (rode apenas após deploy da refatoração)
-- drop table if exists public.subscriptions cascade;
