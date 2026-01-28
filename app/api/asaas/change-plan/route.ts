import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { asaasFetch } from "../../../../src/lib/asaas";

export const runtime = "nodejs";

type Body = {
  cycle?: "MONTHLY" | "YEARLY";
};

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL)
      return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const PLAN_VALUE_MONTHLY = Number(process.env.ASAAS_PLAN_VALUE_MONTHLY || "0");
    const PLAN_VALUE_YEARLY = Number(process.env.ASAAS_PLAN_VALUE_YEARLY || "0");

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

    const desiredCycle: "MONTHLY" | "YEARLY" = body.cycle || "MONTHLY";

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id)
      return jsonError("Token inválido ou sessão expirada", 401);

    const userId = userResp.user.id;

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
      .select("id, plan, subscription_status, asaas_subscription_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) return jsonError("Tenant não encontrado", 404);

    const currentPlan = String(tenant.plan || "").toUpperCase();
    if (currentPlan === desiredCycle) {
      return jsonError("Este plano já está selecionado.", 400);
    }

    const asaasSubscriptionId = String(tenant.asaas_subscription_id || "").trim();
    if (!asaasSubscriptionId) {
      return jsonError("Nenhuma assinatura Asaas vinculada ao tenant.", 400);
    }

    const value = desiredCycle === "YEARLY" ? PLAN_VALUE_YEARLY : PLAN_VALUE_MONTHLY;

    // ✅ abordagem segura: tentar atualizar a assinatura existente
    // (se o Asaas bloquear, retornamos erro e você decide se quer recriar)
    const updated = await asaasFetch(`/subscriptions/${encodeURIComponent(asaasSubscriptionId)}`, {
      method: "PUT",
      body: JSON.stringify({
        cycle: desiredCycle,
        value,
      }),
    });

    await supabaseAdmin
      .from("tenants")
      .update({ plan: desiredCycle })
      .eq("id", tenantId);

    await supabaseAdmin
      .from("asaas_subscriptions")
      .upsert(
        {
          asaas_subscription_id: asaasSubscriptionId,
          cycle: desiredCycle,
          status: String(updated?.status || "").toUpperCase() || null,
          next_due_date: updated?.nextDueDate || null,
          updated_at: new Date().toISOString(),
          tenant_id: tenantId,
        },
        { onConflict: "asaas_subscription_id" }
      );

    return NextResponse.json({
      ok: true,
      tenantId,
      asaasSubscriptionId,
      plan: desiredCycle,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[ASAAS CHANGE PLAN] unexpected error:", err);
    return jsonError("Erro inesperado ao trocar plano", 500, {
      message: String(err?.message || err),
    });
  }
}
