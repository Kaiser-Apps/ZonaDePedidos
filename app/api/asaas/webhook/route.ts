import { supabaseAdmin } from "../../../../src/lib/supabaseAdmin";

export const runtime = "nodejs";

function toDateOnly(v?: string | null) {
  if (!v) return null;
  // Asaas costuma enviar YYYY-MM-DD
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoMaybe(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function isPaidStatus(v: any) {
  const s = String(v || "").trim().toUpperCase();
  return s === "RECEIVED" || s === "CONFIRMED";
}

export async function POST(req: Request) {
  try {
    const expectedToken = String(process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
    if (expectedToken) {
      const got =
        req.headers.get("asaas-access-token") ||
        req.headers.get("x-webhook-token") ||
        req.headers.get("authorization") ||
        "";

      const normalized = got.toLowerCase().startsWith("bearer ") ? got.slice(7).trim() : got.trim();
      if (!normalized || normalized !== expectedToken) {
        console.log("[ASAAS WEBHOOK] invalid token");
        return new Response("Unauthorized", { status: 401 });
      }
    }

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

    const patch: any = {};

    // pagamentos
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      // ⚠️ Alguns cenários disparam eventos sem pagamento efetivo.
      // Só consideramos pago quando existir uma data de confirmação/recebimento OU status pago.
      const paidAt =
        toIsoMaybe(payment?.paymentDate) ||
        toIsoMaybe(payment?.confirmedDate) ||
        toIsoMaybe(payment?.clientPaymentDate) ||
        toIsoMaybe(payment?.creditDate) ||
        null;
      const paidByStatus = isPaidStatus(payment?.status);
      if (paidAt || paidByStatus) {
        newStatus = "ACTIVE";
        patch.past_due_since = null;
        patch.subscription_status = "ACTIVE";

        // não deixa current_period_end virar null (o que parece "vitalícia" na UI)
        periodEnd = toIsoMaybe(payment?.dueDate) || toIsoMaybe(payment?.creditDate) || null;

        if (periodEnd) {
          patch.current_period_end = periodEnd;
        }
      } else {
        console.log("[ASAAS WEBHOOK] ignore ACTIVE without paymentDate", {
          event,
          paymentId: payment?.id,
          status: payment?.status,
          dueDate: payment?.dueDate,
        });
        // ainda atualizamos last_invoice_url/last_payment_id mais abaixo
      }
    }

    if (event === "PAYMENT_OVERDUE") {
      newStatus = "PAST_DUE";
      periodEnd = toIsoMaybe(payment?.dueDate) || null;
      patch.past_due_since = toIsoMaybe(payment?.dueDate) || new Date().toISOString();
      patch.subscription_status = "PAST_DUE";

      if (periodEnd) {
        patch.current_period_end = periodEnd;
      }
    }

    if (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") {
      newStatus = "INACTIVE";
      periodEnd = null;
      patch.past_due_since = null;
      patch.subscription_status = "INACTIVE";
      patch.current_period_end = null;
    }

    // assinatura (se vier)
    // ⚠️ IMPORTANTE: status da assinatura no Asaas pode ser ACTIVE mesmo sem pagamento confirmado.
    // Para evitar liberar o sistema antes do pagamento, NÃO marcamos ACTIVE aqui.
    if (event === "SUBSCRIPTION_CREATED" || event === "SUBSCRIPTION_UPDATED") {
      // só atualiza datas se vierem preenchidas
      periodEnd = toIsoMaybe(subscription?.nextDueDate) || null;
      // mantém subscription_status como está; apenas atualiza datas.
    }

    if (event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED") {
      newStatus = "INACTIVE";
      periodEnd = null;
      patch.past_due_since = null;
      patch.subscription_status = "INACTIVE";
      patch.current_period_end = null;
    }

    // ⚠️ Fonte de verdade: tabela subscriptions.
    // Não espelha subscription_status/current_period_end em tenants para evitar ativação indevida.
    const shouldClearPeriodEnd =
      event === "PAYMENT_DELETED" ||
      event === "PAYMENT_REFUNDED" ||
      event === "SUBSCRIPTION_INACTIVATED" ||
      event === "SUBSCRIPTION_DELETED";

    if (newStatus === "ACTIVE") {
      patch.trial_ends_at = null;
    }

    // Atualiza apenas campos auxiliares no tenant (ex.: tolerância e limpeza de trial)
    if (Object.keys(patch).length > 0) {
      console.log("[ASAAS WEBHOOK] update tenant (aux)", tenantId, patch);
      const { error: tUpErr } = await supabaseAdmin.from("tenants").update(patch).eq("id", tenantId);
      if (tUpErr) {
        console.log("[ASAAS WEBHOOK] tenants update failed:", tUpErr);
      }
    }

    // ✅ Fonte de verdade agora: asaas_subscriptions (billing_status/current_period_end)
    if (asaasSubscriptionId || payment?.subscription) {
      const subId = String(asaasSubscriptionId || payment?.subscription || "").trim();
      if (subId) {
        const paidAt =
          toIsoMaybe(payment?.paymentDate) ||
          toIsoMaybe(payment?.confirmedDate) ||
          toIsoMaybe(payment?.clientPaymentDate) ||
          toIsoMaybe(payment?.creditDate) ||
          null;

        const upsertSub: any = {
          asaas_subscription_id: subId,
          asaas_customer_id: asaasCustomerId ? String(asaasCustomerId) : null,
          tenant_id: tenantId,
          updated_at: new Date().toISOString(),
        };

        if (newStatus) upsertSub.billing_status = newStatus;
        if (periodEnd) upsertSub.current_period_end = periodEnd;
        else if (shouldClearPeriodEnd) upsertSub.current_period_end = null;

        if (subscription?.nextDueDate) upsertSub.next_due_date = toDateOnly(subscription?.nextDueDate);
        if (payment?.dueDate) upsertSub.next_due_date = toDateOnly(payment?.dueDate);

        if (payment?.id) upsertSub.last_payment_id = String(payment.id);
        if (payment?.invoiceUrl) upsertSub.last_invoice_url = String(payment.invoiceUrl);

        if (paidAt) {
          upsertSub.last_payment_date = toDateOnly(payment?.paymentDate);
          upsertSub.last_payment_value =
            typeof payment?.value === "number" ? payment.value : payment?.value ? Number(payment.value) : null;
        }

        const { error: subUpErr } = await supabaseAdmin
          .from("asaas_subscriptions")
          .upsert(upsertSub, { onConflict: "asaas_subscription_id" });

        if (subUpErr) {
          console.log("[ASAAS WEBHOOK] asaas_subscriptions billing upsert failed:", subUpErr);
        }
      }
    }

    // ✅ Upsert do pagamento (para dashboard/relatórios) - se a tabela existir
    if (payment?.id) {
      try {
        await supabaseAdmin.from("asaas_payments").upsert(
          {
            asaas_payment_id: String(payment.id),
            asaas_subscription_id: payment?.subscription ? String(payment.subscription) : null,
            asaas_customer_id: asaasCustomerId ? String(asaasCustomerId) : null,
            tenant_id: tenantId,
            status: payment?.status ? String(payment.status).toUpperCase() : null,
            billing_type: payment?.billingType ? String(payment.billingType).toUpperCase() : null,
            value: typeof payment?.value === "number" ? payment.value : payment?.value ? Number(payment.value) : null,
            net_value:
              typeof payment?.netValue === "number" ? payment.netValue : payment?.netValue ? Number(payment.netValue) : null,
            due_date: toDateOnly(payment?.dueDate),
            payment_date: toDateOnly(payment?.paymentDate),
            invoice_url: payment?.invoiceUrl ? String(payment.invoiceUrl) : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "asaas_payment_id" }
        );
      } catch (err) {
        console.log("[ASAAS WEBHOOK] asaas_payments upsert skipped/failed:", err);
      }
    }

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
          const { error: metaUpErr } = await supabaseAdmin.from("asaas_subscriptions").upsert({
            asaas_subscription_id: subJson.id,
            asaas_customer_id: subJson.customer,
            tenant_id: tenantId,
            email: subJson.customer?.email || null,
            cycle: subJson.cycle,
            status: subJson.status,
            next_due_date: subJson.nextDueDate || null,
            last_payment_date: subJson.lastInvoiceDate || null,
            // não sobrescreve billing_status/current_period_end aqui; isso vem dos eventos de pagamento
            updated_at: new Date().toISOString(),
          }, { onConflict: "asaas_subscription_id" });

          if (metaUpErr) {
            console.log("[ASAAS WEBHOOK] asaas_subscriptions meta upsert failed:", metaUpErr);
          }
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
