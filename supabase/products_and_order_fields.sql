-- Add Products table + new fields on orders
-- Run this in Supabase SQL editor.

-- 1) Products catalog (per tenant, optionally per client)
create table if not exists public.products (
  id uuid not null default uuid_generate_v4(),
  created_at timestamp with time zone not null default now(),
  tenant_id uuid not null,
  client_id uuid null,
  nome text not null,
  identificador text null,
  marca text null,
  modelo text null,
  observacao text null,
  created_by uuid null,
  updated_by uuid null,
  constraint products_pkey primary key (id),
  constraint products_tenant_id_fkey foreign key (tenant_id) references public.tenants(id),
  constraint products_client_id_fkey foreign key (client_id) references public.clients(id)
);

-- If the table already exists, ensure new columns exist too.
alter table public.products
  add column if not exists identificador text null,
  add column if not exists marca text null,
  add column if not exists modelo text null;

create index if not exists products_tenant_id_idx on public.products (tenant_id);
create index if not exists products_tenant_client_id_idx on public.products (tenant_id, client_id);
create index if not exists products_tenant_nome_idx on public.products (tenant_id, nome);

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

-- 3) Order products (supports multiple products per order)
create table if not exists public.order_products (
  id uuid not null default uuid_generate_v4(),
  created_at timestamp with time zone not null default now(),
  tenant_id uuid not null,
  order_id uuid not null,
  product_id uuid null,
  nome text not null,
  identificador text null,
  marca text null,
  modelo text null,
  observacao text null,
  created_by uuid null,
  updated_by uuid null,
  constraint order_products_pkey primary key (id),
  constraint order_products_tenant_id_fkey foreign key (tenant_id) references public.tenants(id),
  constraint order_products_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade,
  constraint order_products_product_id_fkey foreign key (product_id) references public.products(id)
);

create index if not exists order_products_tenant_order_idx on public.order_products (tenant_id, order_id);
create index if not exists order_products_tenant_product_idx on public.order_products (tenant_id, product_id);
