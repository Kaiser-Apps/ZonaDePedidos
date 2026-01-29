-- Tabela para armazenar assinaturas do Asaas vinculadas aos tenants
CREATE TABLE IF NOT EXISTS public.asaas_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asaas_subscription_id text UNIQUE NOT NULL,
  asaas_customer_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text,
  cycle text,
  status text,
  next_due_date date,
  last_payment_date date,
  last_payment_value numeric,
  payment_link_name text,

  -- Campos de billing (equivalentes ao que antes ficava em public.subscriptions)
  billing_status text,
  current_period_end timestamp with time zone,
  last_payment_id text,
  last_invoice_url text,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Index para busca rápida por customer
CREATE INDEX IF NOT EXISTS idx_asaas_subscriptions_customer ON public.asaas_subscriptions(asaas_customer_id);
-- Index para busca por tenant
CREATE INDEX IF NOT EXISTS idx_asaas_subscriptions_tenant ON public.asaas_subscriptions(tenant_id);