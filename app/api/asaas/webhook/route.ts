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

    return Response.json({ received: true });
  } catch (e: any) {
    console.log("[ASAAS WEBHOOK] error:", e);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
