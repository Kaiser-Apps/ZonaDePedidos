import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { asaasFetch } from "../../../../src/lib/asaas";

export const runtime = "nodejs";

type Body = {
  cycle?: "MONTHLY" | "YEARLY";
  promocode?: string;
};

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function normalizeCode(code: any) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function onlyDigits(v: any) {
  return String(v || "").replace(/\D/g, "");
}

function normalizeCpfCnpj(v: any) {
  const d = onlyDigits(v);
  if (d.length === 11 || d.length === 14) return d;
  return "";
}

function addDaysDateOnly(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL)
      return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const BILLING_TYPE = (process.env.ASAAS_BILLING_TYPE || "").trim() || "UNDEFINED";
    const PLAN_VALUE_MONTHLY = Number(process.env.ASAAS_PLAN_VALUE_MONTHLY || "0");
    const PLAN_VALUE_YEARLY = Number(process.env.ASAAS_PLAN_VALUE_YEARLY || "0");
    const PLAN_DESCRIPTION = (process.env.ASAAS_PLAN_DESCRIPTION || "Assinatura").trim();

    if (!Number.isFinite(PLAN_VALUE_MONTHLY) || PLAN_VALUE_MONTHLY <= 0) {
      return jsonError("ASAAS_PLAN_VALUE_MONTHLY inválido/ausente no env", 500);
    }
    if (!Number.isFinite(PLAN_VALUE_YEARLY) || PLAN_VALUE_YEARLY <= 0) {
      return jsonError("ASAAS_PLAN_VALUE_YEARLY inválido/ausente no env", 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const cycle: "MONTHLY" | "YEARLY" = body.cycle || "MONTHLY";
    const code = normalizeCode(body.promocode);

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) return jsonError("Token inválido ou sessão expirada", 401);

    const userId = userResp.user.id;
    const userEmail = (userResp.user.email || "").trim().toLowerCase();
    if (!userEmail) return jsonError("Usuário sem email", 400);

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !prof?.tenant_id) {
      return jsonError("Usuário sem tenant vinculado (profiles.tenant_id)", 400);
    }

    const tenantId = String(prof.tenant_id);

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, cnpj, phone, billing_email, asaas_customer_id, asaas_subscription_id, subscription_status, trial_ends_at, current_period_end, plan"
      )
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) return jsonError("Tenant não encontrado", 404);

    // ✅ BOLETO exige CPF/CNPJ no Asaas para criar a cobrança
    const billingTypeUpper = BILLING_TYPE.trim().toUpperCase();
    const cpfCnpj = normalizeCpfCnpj(tenant.cnpj);
    const needsCpfCnpj = true;
    if (needsCpfCnpj && !cpfCnpj) {
      return jsonError(
        "Para assinar, preencha o CPF/CNPJ em Configurações antes de continuar.",
        400,
        { code: "MISSING_CPF_CNPJ" }
      );
    }

    // ✅ Cupom vitalício (família) via ENV
    const FAMILY_LIFETIME_COUPON = normalizeCode(process.env.FAMILY_LIFETIME_COUPON || "");
    const FAMILY_LIFETIME_EMAILS = String(process.env.FAMILY_LIFETIME_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (code && FAMILY_LIFETIME_COUPON && code === FAMILY_LIFETIME_COUPON) {
      if (FAMILY_LIFETIME_EMAILS.length > 0 && !FAMILY_LIFETIME_EMAILS.includes(userEmail)) {
        return jsonError("Este cupom não é permitido para este e-mail.", 403);
      }

      const { error: upErr } = await supabaseAdmin
        .from("tenants")
        .update({
          subscription_status: "ACTIVE",
          plan: "FAMILY",
          trial_ends_at: null,
          current_period_end: null,
          billing_email: userEmail,
        })
        .eq("id", tenantId);

      if (upErr) {
        return jsonError("Falha ao aplicar cupom vitalício", 500, {
          code: upErr.code,
          message: upErr.message,
        });
      }

      return NextResponse.json({
        ok: true,
        mode: "LIFETIME" as const,
        tenantId,
        plan: "FAMILY",
        subscription_status: "ACTIVE",
        ms: Date.now() - startedAt,
      });
    }

    // ✅ Sempre garantir billing_email no tenant
    if ((tenant.billing_email || "").trim().toLowerCase() !== userEmail) {
      await supabaseAdmin.from("tenants").update({ billing_email: userEmail }).eq("id", tenantId);
    }

    // ✅ Cria customer no Asaas se necessário
    let asaasCustomerId = (tenant.asaas_customer_id || "").trim() || null;
    if (!asaasCustomerId) {
      const customerPayload: any = {
        name: tenant.name || "Cliente",
        email: userEmail,
        cpfCnpj: cpfCnpj || undefined,
        phone: tenant.phone || undefined,
        externalReference: `tenant:${tenantId}`,
      };

      const custJson = await asaasFetch("/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });

      asaasCustomerId = custJson?.id || null;
      if (!asaasCustomerId) return jsonError("Asaas não retornou customer id", 502);

      const { error: upErr } = await supabaseAdmin
        .from("tenants")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", tenantId);

      if (upErr) return jsonError("Falha ao salvar customer no tenant", 500);
    }

    // ✅ Se billingType=BOLETO, GARANTE que o customer tem cpfCnpj no Asaas
    if (needsCpfCnpj && asaasCustomerId) {
      const ensureCustomerCpfCnpj = async () => {
        const cust = await asaasFetch(`/customers/${encodeURIComponent(asaasCustomerId)}`, {
          method: "GET",
        });

        const existing = normalizeCpfCnpj(cust?.cpfCnpj);
        if (existing) return;

        // tenta atualizar com dados completos
        await asaasFetch(`/customers/${encodeURIComponent(asaasCustomerId)}`, {
          method: "PUT",
          body: JSON.stringify({
            cpfCnpj,
            name: tenant.name || "Cliente",
            email: userEmail,
            phone: tenant.phone || undefined,
          }),
        });

        const cust2 = await asaasFetch(`/customers/${encodeURIComponent(asaasCustomerId)}`, {
          method: "GET",
        });

        const updated = normalizeCpfCnpj(cust2?.cpfCnpj);
        if (!updated) {
          throw new Error("CPF/CNPJ ainda ausente no customer do Asaas após tentativa de atualização.");
        }
      };

      try {
        await ensureCustomerCpfCnpj();
      } catch (e: any) {
        console.log("[ASAAS CREATE SUB] could not ensure cpfCnpj on customer", {
          asaasCustomerId,
          message: String(e?.message || e),
        });

        return jsonError(
          "Seu cadastro no Asaas está sem CPF/CNPJ. Atualize em Configurações e tente novamente.",
          400,
          { code: "MISSING_CPF_CNPJ_ON_ASAAS" }
        );
      }
    }

    // ✅ Cupom (tabela promo_codes via RPC): hoje ele só fornece trial
    let trialDays = 0;
    let trialEndsAtIso: string | null = null;

    if (code) {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("redeem_promocode", {
        p_promocode: code,
        p_tenant_id: tenantId,
        p_user_id: userId,
      });

      if (rpcErr) {
        return jsonError("Erro ao validar cupom (RPC).", 500, {
          code: rpcErr.code,
          message: rpcErr.message,
          details: rpcErr.details,
          hint: rpcErr.hint,
        });
      }

      const ok = Boolean(rpcData?.ok);
      if (!ok) {
        return jsonError(rpcData?.message || "Cupom inválido.", 400, { rpc: rpcData });
      }

      // tenta extrair trial_days ou calcular a partir de trial_ends_at
      if (typeof rpcData?.trial_days === "number" && rpcData.trial_days > 0) {
        trialDays = rpcData.trial_days;
      }

      if (rpcData?.trial_ends_at) {
        const d = new Date(String(rpcData.trial_ends_at));
        if (!Number.isNaN(d.getTime())) {
          trialEndsAtIso = d.toISOString();
          if (!trialDays) {
            const diffMs = d.getTime() - Date.now();
            const rawDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
            trialDays = Math.max(0, rawDays);
          }
        }
      }
    }

    const value = cycle === "YEARLY" ? PLAN_VALUE_YEARLY : PLAN_VALUE_MONTHLY;

    // Trial: se tiver trial, a primeira cobrança fica para o final do trial.
    // Sem trial: cobra imediatamente (nextDueDate = hoje).
    const nextDueDate = trialDays > 0 ? addDaysDateOnly(trialDays) : addDaysDateOnly(0);

    const subscriptionPayload: any = {
      customer: asaasCustomerId,
      billingType: billingTypeUpper,
      cycle,
      value,
      nextDueDate,
      description: PLAN_DESCRIPTION,
      externalReference: `tenant:${tenantId}`,
    };

    const subJson = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionPayload),
    });

    const asaasSubscriptionId = subJson?.id || null;
    if (!asaasSubscriptionId) {
      return jsonError("Asaas não retornou subscription id", 502, { asaas: subJson });
    }

    // ✅ Persiste em tenants (plano escolhido + subscription_id)
    // Se trialDays>0, já marca TRIAL localmente para liberar acesso.
    const tenantPatch: any = {
      plan: cycle,
      asaas_subscription_id: asaasSubscriptionId,
    };

    if (trialDays > 0) {
      tenantPatch.subscription_status = "TRIAL";
      tenantPatch.trial_ends_at = trialEndsAtIso || new Date(Date.now() + trialDays * 86400000).toISOString();
    }

    await supabaseAdmin.from("tenants").update(tenantPatch).eq("id", tenantId);

    // ✅ Salva/atualiza tabela asaas_subscriptions
    await supabaseAdmin
      .from("asaas_subscriptions")
      .upsert(
        {
          asaas_subscription_id: asaasSubscriptionId,
          asaas_customer_id: asaasCustomerId,
          tenant_id: tenantId,
          email: userEmail,
          cycle,
          status: String(subJson?.status || "").toUpperCase() || null,
          next_due_date: subJson?.nextDueDate || nextDueDate,
          billing_status: trialDays > 0 ? "TRIAL" : "PENDING",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "asaas_subscription_id" }
      );

    // ✅ Tenta obter o 1º pagamento para capturar invoiceUrl
    // Em alguns casos o payment pode demorar alguns ms para aparecer.
    let invoiceUrl: string | null = null;
    let paymentId: string | null = null;
    let paymentStatus: string | null = null;

    for (let i = 0; i < 3; i++) {
      const payJson = await asaasFetch(
        `/payments?subscription=${encodeURIComponent(asaasSubscriptionId)}&limit=1&offset=0&sort=createdAt&order=desc`,
        { method: "GET" }
      );

      const first = Array.isArray(payJson?.data) && payJson.data.length > 0 ? payJson.data[0] : null;
      invoiceUrl = first?.invoiceUrl || null;
      paymentId = first?.id || null;
      paymentStatus = first?.status || null;

      if (invoiceUrl) break;
      await sleep(450);
    }

    // ✅ Persistir dados do primeiro pagamento (invoiceUrl) para consulta via billing/status
    if (paymentId || invoiceUrl) {
      await supabaseAdmin
        .from("asaas_subscriptions")
        .upsert(
          {
            asaas_subscription_id: asaasSubscriptionId,
            tenant_id: tenantId,
            last_payment_id: paymentId,
            last_invoice_url: invoiceUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "asaas_subscription_id" }
        );
    }

    return NextResponse.json({
      ok: true,
      mode: trialDays > 0 ? ("TRIAL" as const) : ("PAYMENT" as const),
      tenantId,
      asaasCustomerId,
      asaasSubscriptionId,
      cycle,
      trialDays,
      trial_ends_at: trialDays > 0 ? (tenantPatch.trial_ends_at as string) : null,
      payment: invoiceUrl
        ? { id: paymentId, status: paymentStatus, invoiceUrl }
        : null,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[ASAAS CREATE SUB] unexpected error:", err);
    return jsonError("Erro inesperado na API", 500, {
      message: String(err?.message || err),
    });
  }
}
