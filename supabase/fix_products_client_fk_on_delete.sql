-- Permite excluir um cliente sem falhar por FK em products.client_id
-- Estratégia: ON DELETE SET NULL (preserva o catálogo; apenas desvincula)
-- Execute no SQL Editor do Supabase.

begin;

-- Garante que client_id pode ser nulo
alter table if exists public.products
  alter column client_id drop not null;

-- Troca a FK para ON DELETE SET NULL
alter table if exists public.products
  drop constraint if exists products_client_id_fkey;

alter table if exists public.products
  add constraint products_client_id_fkey
  foreign key (client_id)
  references public.clients(id)
  on delete set null;

commit;
