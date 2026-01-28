import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ASAAS_API_KEY = process.env.ASAAS_API_KEY || "";
const ASAAS_BASE_URL = (process.env.ASAAS_BASE_URL || "https://api.asaas.com").replace(/\/$/, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Buscar todos tenants com asaas_customer_id
  const { data: tenants, error: tenantsErr } = await supabase
    .from("tenants")
    .select("id, asaas_customer_id, billing_email")
    .not("asaas_customer_id", "is", null);

  if (tenantsErr) {
    return NextResponse.json({ ok: false, message: "Erro ao buscar tenants", tenantsErr }, { status: 500 });
  }

  let total = 0, updated = 0, errors = [] as any[];

  for (const tenant of tenants) {
    try {
      // 2. Buscar assinaturas do customer no Asaas
      const subsRes = await fetch(`${ASAAS_BASE_URL}/v3/subscriptions?customer=${tenant.asaas_customer_id}`, {
        headers: { "access_token": ASAAS_API_KEY },
      });
      const subsJson = await subsRes.json();
      if (!subsRes.ok) throw new Error(JSON.stringify(subsJson));
      for (const sub of subsJson.data || []) {
        total++;
        // 3. Upsert na tabela local
        const { error: upErr } = await supabase
          .from("asaas_subscriptions")
          .upsert({
            asaas_subscription_id: sub.id,
            asaas_customer_id: tenant.asaas_customer_id,
            tenant_id: tenant.id,
            email: tenant.billing_email || sub.customer?.email || null,
            cycle: sub.cycle,
            status: sub.status,
            next_due_date: sub.nextDueDate || null,
            last_payment_date: sub.lastInvoiceDate || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "asaas_subscription_id" });
        if (!upErr) updated++;
        else errors.push({ tenantId: tenant.id, subId: sub.id, upErr });
      }
    } catch (err: any) {
      errors.push({ tenantId: tenant.id, err: String(err) });
    }
  }

  return NextResponse.json({ ok: true, total, updated, errors });
}
