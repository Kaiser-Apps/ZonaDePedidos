import { supabaseAdmin } from "../../../../src/lib/supabaseAdmin";

export const runtime = "nodejs";

function toIsoMaybe(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const event = String(body?.event || "");
    console.log("[ASAAS WEBHOOK] event:", event);
    console.log("[ASAAS WEBHOOK] full body:", JSON.stringify(body, null, 2));

    const payment = body?.payment || null;
    const subscription = body?.subscription || null;

    // Extrai IDs disponíveis
    const asaasCustomerId = payment?.customer || subscription?.customer || null;
    const asaasSubscriptionId = payment?.subscription || subscription?.id || null;

    console.log("[ASAAS WEBHOOK] asaasCustomerId:", asaasCustomerId);
    console.log("[ASAAS WEBHOOK] asaasSubscriptionId:", asaasSubscriptionId);

    if (!asaasCustomerId) {
      console.log("[ASAAS WEBHOOK] ⚠️ customer ID não encontrado. body:", body);
      return Response.json({ received: true });
    }

    // Procura tenant pelo asaas_customer_id
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("asaas_customer_id", String(asaasCustomerId))
      .maybeSingle();

    let tenantId: string | null = tenant?.id || null;

    if (!tenantId) {
      console.log("[ASAAS WEBHOOK] ⚠️ tenantId não encontrado para asaas_customer_id:", asaasCustomerId);
      return Response.json({ received: true });
    }

    console.log("[ASAAS WEBHOOK] ✅ tenant encontrado:", tenantId);

    let newStatus: string | null = null;
    let periodEnd: string | null = null;

    // pagamentos
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      newStatus = "ACTIVE";
      periodEnd = toIsoMaybe(payment?.dueDate) || null;
    }

    if (event === "PAYMENT_OVERDUE") {
      newStatus = "PAST_DUE";
      periodEnd = toIsoMaybe(payment?.dueDate) || null;
    }

    if (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") {
      newStatus = "INACTIVE";
      periodEnd = null;
    }

    // assinatura (se vier)
    if (event === "SUBSCRIPTION_CREATED" || event === "SUBSCRIPTION_UPDATED") {
      const st = String(subscription?.status || "ACTIVE").toUpperCase();
      newStatus = st === "ACTIVE" ? "ACTIVE" : st;
      periodEnd = toIsoMaybe(subscription?.nextDueDate) || null;
    }

    if (event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED") {
      newStatus = "INACTIVE";
      periodEnd = null;
    }

    const patch: any = {};
    if (newStatus) patch.subscription_status = newStatus;
    if (periodEnd !== undefined) patch.current_period_end = periodEnd;

    if (newStatus === "ACTIVE") {
      patch.plan = "paid";
      patch.trial_ends_at = null;
    }

    if (newStatus === "INACTIVE") patch.plan = "free";

    console.log("[ASAAS WEBHOOK] update tenant", tenantId, patch);

    await supabaseAdmin.from("tenants").update(patch).eq("id", tenantId);

    // Atualiza/insere assinatura na tabela local
    if (asaasSubscriptionId) {
      // Busca dados atualizados da assinatura na API do Asaas
      try {
        const ASAAS_API_KEY = process.env.ASAAS_API_KEY || "";
        const ASAAS_BASE_URL = (process.env.ASAAS_BASE_URL || "https://api.asaas.com").replace(/\/$/, "");
        const subRes = await fetch(`${ASAAS_BASE_URL}/v3/subscriptions/${asaasSubscriptionId}`, {
          headers: { "access_token": ASAAS_API_KEY },
        });
        const subJson = await subRes.json();
        if (subRes.ok && subJson?.id) {
          await supabaseAdmin.from("asaas_subscriptions").upsert({
            asaas_subscription_id: subJson.id,
            asaas_customer_id: subJson.customer,
            tenant_id: tenantId,
            email: subJson.customer?.email || null,
            cycle: subJson.cycle,
            status: subJson.status,
            next_due_date: subJson.nextDueDate || null,
            last_payment_date: subJson.lastInvoiceDate || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "asaas_subscription_id" });
        }
      } catch (err) {
        console.log("[ASAAS WEBHOOK] erro ao atualizar asaas_subscriptions:", err);
      }
    }

    return Response.json({ received: true });
  } catch (e: any) {
    console.log("[ASAAS WEBHOOK] error:", e);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
