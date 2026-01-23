// app/api/asaas/create-recurring-link/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  planName?: string; // nome do plano (opcional)
  value?: number; // valor (opcional)
  cycle?: "MONTHLY" | "YEARLY"; // ciclo (opcional)
};

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function resolveAsaasBaseUrl() {
  const fromEnv = (process.env.ASAAS_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const env = (process.env.ASAAS_ENV || "").toLowerCase().trim();
  if (env === "sandbox") return "https://api-sandbox.asaas.com";
  return "https://api.asaas.com";
}

function normalizeAsaasApiKey(raw: string | undefined | null) {
  const key = String(raw || "").trim();
  if (!key) return "";

  if (key.startsWith("$")) return key;

  if (
    key.startsWith("aact_") ||
    key.startsWith("aact_prod_") ||
    key.startsWith("aact_sandbox_")
  ) {
    return `$${key}`;
  }

  return key;
}

async function safeReadJson(resp: Response) {
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return resp.json().catch(() => ({}));
  }
  const text = await resp.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function firstAsaasErrorDescription(asaasBody: any) {
  const desc =
    asaasBody?.errors?.[0]?.description ||
    asaasBody?.errors?.[0]?.message ||
    null;
  return typeof desc === "string" && desc.trim() ? desc.trim() : null;
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const ASAAS_BASE_URL = resolveAsaasBaseUrl();
    const ASAAS_API_KEY = normalizeAsaasApiKey(process.env.ASAAS_API_KEY);

    if (!SUPABASE_URL)
      return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);
    if (!ASAAS_API_KEY) return jsonError("ASAAS_API_KEY ausente no env", 500);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";

    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    console.log("[ASAAS] baseUrl:", ASAAS_BASE_URL);
    console.log("[ASAAS] env supabase host:", new URL(SUPABASE_URL).host);
    console.log("[ASAAS] apiKey startsWith$:", ASAAS_API_KEY.startsWith("$"));

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(
      jwt
    );
    if (userErr || !userResp?.user?.id) {
      console.log("[ASAAS] auth.getUser error:", userErr);
      return jsonError("Token inválido ou sessão expirada", 401);
    }

    const userId = userResp.user.id;
    console.log("[ASAAS] userId:", userId);

    const { data: prof, error: profErr, count: profCount } =
      await supabaseAdmin
        .from("profiles")
        .select("tenant_id", { count: "exact" })
        .eq("user_id", userId)
        .maybeSingle();

    console.log("[ASAAS] profiles count for user:", {
      profCount,
      profCountErr: profErr || null,
    });

    if (profErr || !prof?.tenant_id) {
      console.log("[ASAAS] profile error:", profErr);
      return jsonError("Usuário sem tenant vinculado (profiles.tenant_id)", 400);
    }

    const tenantId = String(prof.tenant_id);
    console.log("[ASAAS] user -> tenant resolved", { userId, tenantId });

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, cnpj, phone, endereco, asaas_customer_id, asaas_recurring_link_id, asaas_recurring_link_url"
      )
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr) {
      console.log("[ASAAS] tenant load error:", { tenantId, tErr });
      return jsonError("Erro ao carregar tenant no Supabase", 500, {
        code: tErr.code,
        message: tErr.message,
      });
    }

    if (!tenant) {
      console.log("[ASAAS] tenant not found:", { tenantId });
      return jsonError("Tenant não encontrado", 404);
    }

    if (tenant.asaas_recurring_link_id && tenant.asaas_recurring_link_url) {
      console.log("[ASAAS] reusing existing link:", {
        tenantId,
        linkId: tenant.asaas_recurring_link_id,
      });

      return NextResponse.json({
        ok: true,
        tenantId,
        asaas_customer_id: tenant.asaas_customer_id || null,
        linkId: tenant.asaas_recurring_link_id,
        url: tenant.asaas_recurring_link_url,
        ms: Date.now() - startedAt,
        reused: true,
      });
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const planName = (body.planName || "Assinatura Zona de Pedidos").trim();
    const value =
      typeof body.value === "number" && body.value > 0 ? body.value : 39.9;
    const cycle = body.cycle || "MONTHLY";

    // 1) Garante customer no Asaas
    let asaasCustomerId = (tenant.asaas_customer_id as string | null) || null;

    if (!asaasCustomerId) {
      console.log("[ASAAS] creating customer for tenant...");

      const customerPayload: any = {
        name: tenant.name || "Tenant",
        phone: tenant.phone || undefined,
        cpfCnpj: tenant.cnpj || undefined,
        externalReference: `tenant:${tenant.id}`,
      };

      const custResp = await fetch(`${ASAAS_BASE_URL}/v3/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: ASAAS_API_KEY,
        },
        body: JSON.stringify(customerPayload),
      });

      const custJson = await safeReadJson(custResp);

      if (!custResp.ok) {
        console.log("[ASAAS] create customer failed:", {
          status: custResp.status,
          body: custJson,
        });

        const msg =
          firstAsaasErrorDescription(custJson) || "Falha ao criar customer no Asaas";

        return jsonError(msg, 502, {
          status: custResp.status,
          asaas: custJson,
        });
      }

      asaasCustomerId = custJson?.id || null;
      if (!asaasCustomerId) {
        console.log("[ASAAS] create customer no id:", custJson);
        return jsonError("Asaas não retornou customer id", 502, { asaas: custJson });
      }

      const { error: upErr } = await supabaseAdmin
        .from("tenants")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", tenantId);

      if (upErr) {
        console.log("[ASAAS] failed saving asaas_customer_id:", upErr);
        return jsonError("Falha ao salvar asaas_customer_id no tenant", 500, {
          code: upErr.code,
          message: upErr.message,
        });
      }
    }

    // 2) Cria link recorrente
    console.log("[ASAAS] creating recurring payment link...", { cycle, value });

    // ✅ Para RECURRENT o exemplo oficial usa billingType CREDIT_CARD
    const linkPayload: any = {
      name: planName,
      description: `Assinatura (${cycle})`,
      billingType: "CREDIT_CARD",
      chargeType: "RECURRENT",
      subscriptionCycle: cycle,
      value,
      externalReference: `tenant:${tenant.id}`,
      notificationEnabled: false,
    };

    const linkResp = await fetch(`${ASAAS_BASE_URL}/v3/paymentLinks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: ASAAS_API_KEY,
      },
      body: JSON.stringify(linkPayload),
    });

    const linkJson = await safeReadJson(linkResp);

    if (!linkResp.ok) {
      console.log("[ASAAS] create payment link failed:", {
        status: linkResp.status,
        body: linkJson,
        payload: linkPayload,
      });

      const msg =
        firstAsaasErrorDescription(linkJson) ||
        "Falha ao criar link recorrente no Asaas";

      return jsonError(msg, 502, {
        status: linkResp.status,
        asaas: linkJson,
      });
    }

    const linkId = linkJson?.id || null;
    const linkUrl = linkJson?.url || null;

    if (!linkId || !linkUrl) {
      console.log("[ASAAS] payment link missing fields:", linkJson);
      return jsonError("Asaas não retornou id/url do link", 502, { asaas: linkJson });
    }

    const { error: saveLinkErr } = await supabaseAdmin
      .from("tenants")
      .update({
        asaas_recurring_link_id: linkId,
        asaas_recurring_link_url: linkUrl,
      })
      .eq("id", tenantId);

    if (saveLinkErr) {
      console.log("[ASAAS] failed saving link on tenant:", saveLinkErr);
      return jsonError("Falha ao salvar link recorrente no tenant", 500, {
        code: saveLinkErr.code,
        message: saveLinkErr.message,
      });
    }

    console.log("[ASAAS] done", { ms: Date.now() - startedAt, tenantId, linkId });

    return NextResponse.json({
      ok: true,
      tenantId,
      asaas_customer_id: asaasCustomerId,
      linkId,
      url: linkUrl,
      ms: Date.now() - startedAt,
      reused: false,
    });
  } catch (err: any) {
    console.log("[ASAAS] unexpected error:", err);
    return jsonError("Erro inesperado na API", 500, {
      message: String(err?.message || err),
    });
  }
}
