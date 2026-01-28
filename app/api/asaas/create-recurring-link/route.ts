// app/api/asaas/create-recurring-link/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  cycle?: "MONTHLY" | "YEARLY"; // ciclo (MONTHLY ou YEARLY)
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

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ASAAS_API_KEY = (process.env.ASAAS_API_KEY || "").trim();
    
    const ASAAS_LINK_MENSAL = (process.env.NEXT_PUBLIC_ASAAS_LINK_MENSAL || "").trim();
    const ASAAS_LINK_ANUAL = (process.env.NEXT_PUBLIC_ASAAS_LINK_ANUAL || "").trim();

    if (!SUPABASE_URL)
      return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);
    if (!ASAAS_API_KEY)
      return jsonError("ASAAS_API_KEY ausente no env", 500);
    if (!ASAAS_LINK_MENSAL || !ASAAS_LINK_ANUAL)
      return jsonError("Links do Asaas (NEXT_PUBLIC_ASAAS_LINK_MENSAL/ANUAL) não configurados", 500);

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";

    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) {
      console.log("[ASAAS] auth.getUser error:", userErr);
      return jsonError("Token inválido ou sessão expirada", 401);
    }

    const userId = userResp.user.id;
    const userEmail = userResp.user.email || "";
    
    console.log("[ASAAS] userId:", userId, "email:", userEmail);

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !prof?.tenant_id) {
      console.log("[ASAAS] profile error:", profErr);
      return jsonError("Usuário sem tenant vinculado", 400);
    }

    const tenantId = String(prof.tenant_id);
    console.log("[ASAAS] user -> tenant resolved", { userId, tenantId });

    // Carrega tenant para verificar se já tem customer
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, name, cnpj, phone, asaas_customer_id, subscription_status")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) {
      console.log("[ASAAS] tenant load error:", { tenantId, tErr });
      return jsonError("Tenant não encontrado", 404);
    }

    // Proteção: se já está ACTIVE, não precisa de novo link
    if (tenant.subscription_status === "ACTIVE") {
      console.log("[ASAAS] tenant já está ativo:", tenantId);
      return jsonError("Sua assinatura já está ativa", 400);
    }

    let asaasCustomerId = tenant.asaas_customer_id || null;

    // Se não tiver customer, cria um no Asaas
    if (!asaasCustomerId) {
      console.log("[ASAAS] creating customer for tenant...");

      const ASAAS_BASE_URL = resolveAsaasBaseUrl();
      
      const customerPayload: any = {
        name: tenant.name || "Cliente",
        email: userEmail,
        cpfCnpj: tenant.cnpj || undefined,
        phone: tenant.phone || undefined,
        externalReference: `tenant:${tenantId}`,
      };

      const custResp = await fetch(`${ASAAS_BASE_URL}/v3/customers`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "access_token": ASAAS_API_KEY,
        },
        body: JSON.stringify(customerPayload),
      });

      const custJson = await custResp.json().catch(() => ({}));

      if (!custResp.ok) {
        console.log("[ASAAS] create customer failed:", {
          status: custResp.status,
          body: custJson,
        });
        return jsonError("Falha ao criar customer no Asaas", 502, { asaas: custJson });
      }

      asaasCustomerId = custJson?.id || null;
      if (!asaasCustomerId) {
        console.log("[ASAAS] create customer no id:", custJson);
        return jsonError("Asaas não retornou customer id", 502, { asaas: custJson });
      }

      // Salva customer ID no tenant
      const { error: upErr } = await supabaseAdmin
        .from("tenants")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", tenantId);

      if (upErr) {
        console.log("[ASAAS] failed saving asaas_customer_id:", upErr);
        return jsonError("Falha ao salvar customer no tenant", 500);
      }

      console.log("[ASAAS] customer created:", asaasCustomerId);
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const cycle = body.cycle || "MONTHLY";
    const paymentLink = cycle === "YEARLY" ? ASAAS_LINK_ANUAL : ASAAS_LINK_MENSAL;

    console.log("[ASAAS] returning payment link", { tenantId, cycle, asaasCustomerId });

    return NextResponse.json({
      ok: true,
      tenantId,
      asaasCustomerId,
      email: userEmail,
      cycle,
      url: paymentLink,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[ASAAS] unexpected error:", err);
    return jsonError("Erro inesperado na API", 500, {
      message: String(err?.message || err),
    });
  }
}
