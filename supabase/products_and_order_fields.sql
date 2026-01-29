-- Add Products table + new fields on orders
-- Run this in Supabase SQL editor.

-- 1) Products catalog (per tenant, optionally per client)
create table if not exists public.products (
  id uuid not null default uuid_generate_v4(),
  created_at timestamp with time zone not null default now(),
  tenant_id uuid not null,
  client_id uuid null,
  nome text not null,
  observacao text null,
  created_by uuid null,
  updated_by uuid null,
  constraint products_pkey primary key (id),
  constraint products_tenant_id_fkey foreign key (tenant_id) references public.tenants(id),
  constraint products_client_id_fkey foreign key (client_id) references public.clients(id)
);

create index if not exists products_tenant_id_idx on public.products (tenant_id);
create index if not exists products_tenant_client_id_idx on public.products (tenant_id, client_id);

-- 2) Orders: Observação + Produto
alter table public.orders
  add column if not exists observacao text null,
  add column if not exists produto text null,
  add column if not exists product_id uuid null;

do $$
begin
  alter table public.orders
    add constraint orders_product_id_fkey
    foreign key (product_id) references public.products(id);
exception
  when duplicate_object then null;
end $$;

create index if not exists orders_product_id_idx on public.orders (product_id);
