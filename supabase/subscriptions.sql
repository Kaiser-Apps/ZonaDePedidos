-- Execute no SQL Editor do Supabase.
-- Modelo enxuto (mapeamento customer + assinatura como fonte de verdade)

create table if not exists public.asaas_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asaas_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id),
  unique (asaas_customer_id),
  constraint asaas_customers_tenant_id_fkey foreign key (tenant_id) references public.tenants(id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,

  plan_code text not null,          -- 'monthly' | 'yearly'
  status text not null,             -- 'PENDING'|'ACTIVE'|'PAST_DUE'|'CANCELED'|'INACTIVE'|'TRIAL'

  asaas_subscription_id text,
  asaas_customer_id text,

  current_period_start timestamptz,
  current_period_end timestamptz,

  last_payment_id text,
  last_invoice_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create unique index if not exists subscriptions_asaas_subscription_uidx on public.subscriptions (asaas_subscription_id);

alter table public.subscriptions
  add constraint subscriptions_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id);
