-- Enforce unique phone number per tenant (same behavior as CPF)
--
-- This script is safe to re-run.
-- IMPORTANT: if you already have duplicate phone numbers per tenant,
-- the index creation will fail. Use the detection query below first.

-- 1) Detect duplicates (must return 0 rows before creating the index)
select tenant_id, telefone, count(*) as qtd
from public.clients
where telefone is not null
  and telefone <> ''
group by tenant_id, telefone
having count(*) > 1
order by qtd desc, tenant_id;

-- 2) (Optional) Normalize existing phones to digits only.
-- WARNING: this can create new duplicates if numbers were stored with different formatting.
-- update public.clients
-- set telefone = regexp_replace(telefone, '\\D', '', 'g')
-- where telefone is not null;

-- 3) Create partial unique index (only when telefone is present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'uq_clients_tenant_tel'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_clients_tenant_tel'
  ) THEN
    EXECUTE $$
      CREATE UNIQUE INDEX uq_clients_tenant_tel
      ON public.clients (tenant_id, telefone)
      WHERE telefone IS NOT NULL AND telefone <> ''
    $$;
  END IF;
END $$;
