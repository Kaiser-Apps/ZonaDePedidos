-- Tabela para armazenar pagamentos (para dashboard/relatórios)
-- Execute no SQL Editor do Supabase.

create table if not exists public.asaas_payments (
  id uuid not null default gen_random_uuid(),
  asaas_payment_id text not null unique,
  asaas_subscription_id text,
  asaas_customer_id text,
  tenant_id uuid,
  status text,
  billing_type text,
  value numeric,
  net_value numeric,
  due_date date,
  payment_date date,
  invoice_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint asaas_payments_pkey primary key (id),
  constraint asaas_payments_tenant_id_fkey foreign key (tenant_id) references public.tenants(id)
);

create index if not exists idx_asaas_payments_tenant_id on public.asaas_payments (tenant_id);
create index if not exists idx_asaas_payments_subscription_id on public.asaas_payments (asaas_subscription_id);
create index if not exists idx_asaas_payments_status on public.asaas_payments (status);

-- Sugestão RLS: normalmente você controla acesso via service role em APIs.
-- Se quiser expor no client, adicione policies específicas por tenant.
