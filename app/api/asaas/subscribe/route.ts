import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { asaasFetchTyped, type AsaasEnv } from "../../../../src/lib/asaas";

export const runtime = "nodejs";

type PlanCode = "monthly" | "yearly";
type BillingType = "UNDEFINED" | "CREDIT_CARD" | "BOLETO" | "PIX";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function money(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function onlyDigits(v: any) {
  return String(v || "").replace(/\D/g, "");
}

function normalizeCpfCnpj(v: any) {
  const d = onlyDigits(v);
  if (d.length === 11 || d.length === 14) return d;
  return "";
}

function normalizeBillingType(v: any): BillingType | "" {
  const s = String(v || "").trim().toUpperCase();
  if (s === "UNDEFINED" || s === "CREDIT_CARD" || s === "BOLETO" || s === "PIX") return s;
  return "";
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const ASAAS_API_KEY = mustEnv("ASAAS_API_KEY");
    const ASAAS_ENV = (mustEnv("ASAAS_ENV") as AsaasEnv) || "sandbox";

    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const BILLING_TYPE_ENV = normalizeBillingType(process.env.ASAAS_BILLING_TYPE);

    const monthlyName = process.env.NEXT_PUBLIC_PLAN_MONTHLY_NAME || "Plano Mensal";
    const monthlyValue = money(process.env.NEXT_PUBLIC_PLAN_MONTHLY_VALUE || 49.9);

    const yearlyName = process.env.NEXT_PUBLIC_PLAN_YEARLY_NAME || "Plano Anual";
    const yearlyValue = money(process.env.NEXT_PUBLIC_PLAN_YEARLY_VALUE || 499.0);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const body = await req.json().catch(() => ({} as any));
    const plan: PlanCode = body?.plan;
    if (plan !== "monthly" && plan !== "yearly") {
      return jsonError("Plano inválido", 400);
    }

    const billingType =
      normalizeBillingType(body?.billingType) || BILLING_TYPE_ENV || ("UNDEFINED" as BillingType);

    const inputCpfCnpj = normalizeCpfCnpj(body?.cpfCnpj);
    if (body?.cpfCnpj && !inputCpfCnpj) {
      return jsonError("CPF/CNPJ inválido. Use 11 (CPF) ou 14 (CNPJ) dígitos.", 400, {
        code: "INVALID_CPF_CNPJ",
      });
    }

    // 1) resolve usuário/tenant via JWT (padrão do seu app)
    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) return jsonError("Token inválido ou sessão expirada", 401);

    const userId = userResp.user.id;
    const userEmail = (userResp.user.email || "").trim().toLowerCase();

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !prof?.tenant_id) return jsonError("Usuário sem tenant vinculado", 400);
    const tenantId = String(prof.tenant_id);

    // 2) carrega tenant (para criar customer)
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, name, cnpj, phone")
      .eq("id", tenantId)
      .single();

    if (tErr || !tenant) return jsonError("Tenant não encontrado", 404);

    // Asaas frequentemente exige CPF/CNPJ para gerar cobrança. Aqui garantimos sempre.
    const cpfCnpj = inputCpfCnpj || normalizeCpfCnpj(tenant.cnpj);
    if (!cpfCnpj) {
      return jsonError("Preencha o CPF/CNPJ para iniciar a assinatura.", 400, {
        code: "MISSING_CPF_CNPJ",
      });
    }

    // Se o usuário informou um documento novo, salva no tenant (compat: coluna cnpj é usada como doc fiscal)
    if (inputCpfCnpj && normalizeCpfCnpj(tenant.cnpj) !== inputCpfCnpj) {
      await supabaseAdmin.from("tenants").update({ cnpj: inputCpfCnpj }).eq("id", tenantId);
    }

    // 3) garante asaas_customer_id (tabela asaas_customers)
    const { data: existingMap } = await supabaseAdmin
      .from("asaas_customers")
      .select("asaas_customer_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    let asaasCustomerId: string | null = (existingMap?.asaas_customer_id as any) || null;

    if (!asaasCustomerId) {
      const createdCustomer = await asaasFetchTyped<{ id: string }>("/customers", {
        method: "POST",
        env: ASAAS_ENV,
        apiKey: ASAAS_API_KEY,
        body: {
          name: tenant?.name || "Cliente",
          email: userEmail,
          phone: tenant?.phone || undefined,
          cpfCnpj,
          externalReference: `tenant:${tenantId}`,
        },
      });

      asaasCustomerId = createdCustomer?.id || null;
      if (!asaasCustomerId) return jsonError("Asaas não retornou customer id", 502);

      await supabaseAdmin.from("asaas_customers").insert({
        tenant_id: tenantId,
        asaas_customer_id: asaasCustomerId,
      });

      // compat: mantém também no tenant
      await supabaseAdmin.from("tenants").update({ asaas_customer_id: asaasCustomerId }).eq("id", tenantId);
    } else {
      // best-effort: garante cpfCnpj no customer existente
      try {
        await asaasFetchTyped(`/customers/${encodeURIComponent(asaasCustomerId)}`, {
          method: "PUT",
          env: ASAAS_ENV,
          apiKey: ASAAS_API_KEY,
          body: {
            cpfCnpj,
            email: userEmail,
            phone: tenant?.phone || undefined,
            name: tenant?.name || undefined,
          },
        });
      } catch (e) {
        console.log("[ASAAS SUBSCRIBE] warn: failed updating customer cpfCnpj", e);
      }
    }

    // 4) define plano e cria assinatura
    const value = plan === "monthly" ? monthlyValue : yearlyValue;
    const description = plan === "monthly" ? monthlyName : yearlyName;
    const cycle = plan === "monthly" ? "MONTHLY" : "YEARLY";

    const subscription = await asaasFetchTyped<any>("/subscriptions", {
      method: "POST",
      env: ASAAS_ENV,
      apiKey: ASAAS_API_KEY,
      body: {
        customer: asaasCustomerId,
        billingType,
        value,
        cycle,
        description,
        externalReference: `tenant:${tenantId}`,
      },
    });

    const asaasSubscriptionId = String(subscription?.id || "").trim() || null;
    if (!asaasSubscriptionId) return jsonError("Asaas não retornou subscription id", 502);

    // 5) pega cobrança gerada e invoiceUrl
    let invoiceUrl: string | null = null;
    let paymentId: string | null = null;

    for (let i = 0; i < 3; i++) {
      const paymentsList = await asaasFetchTyped<any>(
        `/payments?subscription=${encodeURIComponent(asaasSubscriptionId)}&limit=10&offset=0&sort=createdAt&order=desc`,
        {
          method: "GET",
          env: ASAAS_ENV,
          apiKey: ASAAS_API_KEY,
        }
      );

      const first = Array.isArray(paymentsList?.data) && paymentsList.data.length > 0 ? paymentsList.data[0] : null;
      paymentId = first?.id || null;
      invoiceUrl = first?.invoiceUrl || first?.bankSlipUrl || first?.transactionReceiptUrl || null;

      if (invoiceUrl) break;
      await sleep(450);
    }

    // 6) salva subscriptions (fonte de verdade)
    const nowIso = new Date().toISOString();

    // ✅ Fonte de verdade: asaas_subscriptions (inclui campos de billing)
    await supabaseAdmin.from("asaas_subscriptions").upsert(
      {
        asaas_subscription_id: asaasSubscriptionId,
        asaas_customer_id: asaasCustomerId,
        tenant_id: tenantId,
        email: userEmail || null,
        cycle,
        status: String(subscription?.status || "").toUpperCase() || null,
        next_due_date: subscription?.nextDueDate || null,
        billing_status: "PENDING",
        last_payment_id: paymentId,
        last_invoice_url: invoiceUrl,
        updated_at: nowIso,
      },
      { onConflict: "asaas_subscription_id" }
    );

    // compat: mantém também no tenant (para UI/admin)
    await supabaseAdmin
      .from("tenants")
      .update({ plan: cycle, asaas_subscription_id: asaasSubscriptionId, subscription_status: "PENDING" })
      .eq("id", tenantId);

    return NextResponse.json({
      ok: true,
      tenantId,
      plan,
      asaasCustomerId,
      asaasSubscriptionId,
      redirectUrl: invoiceUrl,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[ASAAS SUBSCRIBE] error:", err);
    return jsonError("Erro ao iniciar assinatura", 500, {
      message: String(err?.message || err),
    });
  }
}
