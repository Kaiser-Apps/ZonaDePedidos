
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

  // Buscar todos tenants para possível associação
  const { data: tenants, error: tenantsErr } = await supabase
    .from("tenants")
    .select("id, asaas_customer_id, billing_email");
  if (tenantsErr) {
    return NextResponse.json({ ok: false, message: "Erro ao buscar tenants", tenantsErr }, { status: 500 });
  }
  // Mapa para lookup rápido
  const tenantByCustomerId = new Map(
    (tenants || [])
      .filter(t => t.asaas_customer_id)
      .map(t => [t.asaas_customer_id, t])
  );

  let total = 0, updated = 0, errors = [] as any[];
  let page = 0, hasMore = true;
  const limit = 100;

  while (hasMore) {
    try {
      const url = `${ASAAS_BASE_URL}/v3/subscriptions?limit=${limit}&offset=${page * limit}`;
      const subsRes = await fetch(url, {
        headers: { "access_token": ASAAS_API_KEY },
      });
      const subsJson = await subsRes.json();
      if (!subsRes.ok) throw new Error(JSON.stringify(subsJson));
      const data = subsJson.data || [];
      for (const sub of data) {
        total++;
        // Tenta associar ao tenant local
        const tenant = tenantByCustomerId.get(sub.customer);
        const tenant_id = tenant?.id || null;
        let email = tenant?.billing_email || null;
        // Se não houver tenant local, busca o e-mail do cliente no Asaas
        if (!email) {
          try {
            const custRes = await fetch(`${ASAAS_BASE_URL}/v3/customers/${sub.customer}`, {
              headers: { "access_token": ASAAS_API_KEY },
            });
            if (custRes.ok) {
              const custJson = await custRes.json();
              email = custJson.email || null;
            }
          } catch (e) {
            errors.push({ subId: sub.id, customerId: sub.customer, err: 'Erro ao buscar email do cliente' });
          }
        }

        // Buscar nome do link de pagamento, se houver paymentLink/paymentLinkId
        let payment_link_name = null;
        const paymentLinkId = sub.paymentLink || sub.paymentLinkId || null;
        if (paymentLinkId) {
          try {
            const linkRes = await fetch(`${ASAAS_BASE_URL}/v3/paymentLinks/${paymentLinkId}`, {
              headers: { "access_token": ASAAS_API_KEY },
            });
            if (linkRes.ok) {
              const linkJson = await linkRes.json();
              payment_link_name = linkJson.name || linkJson.description || null;
            }
          } catch (e) {
            errors.push({ subId: sub.id, paymentLinkId, err: 'Erro ao buscar nome do link' });
          }
        }

        const { error: upErr } = await supabase
          .from("asaas_subscriptions")
          .upsert({
            asaas_subscription_id: sub.id,
            asaas_customer_id: sub.customer,
            tenant_id,
            email,
            cycle: sub.cycle,
            status: sub.status,
            next_due_date: sub.nextDueDate || null,
            last_payment_date: sub.lastInvoiceDate || null,
            payment_link_name,
            updated_at: new Date().toISOString(),
          }, { onConflict: "asaas_subscription_id" });
        if (!upErr) updated++;
        else errors.push({ subId: sub.id, upErr });
      }
      hasMore = data.length === limit;
      page++;
    } catch (err: any) {
      errors.push({ page, err: String(err) });
      break;
    }
  }

  return NextResponse.json({ ok: true, total, updated, errors });
}
