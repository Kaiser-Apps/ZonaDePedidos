import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { asaasFetchTyped, type AsaasEnv } from "../../../../src/lib/asaas";

export const runtime = "nodejs";

type CancelResponse = {
  id?: string;
  deleted?: boolean;
  status?: string;
};

function jsonError(message: string, status = 400, extra?: unknown) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

type TenantRow = {
  id: string;
  asaas_subscription_id: string | null;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const ASAAS_API_KEY = mustEnv("ASAAS_API_KEY");
    const ASAAS_ENV = (mustEnv("ASAAS_ENV") as AsaasEnv) || "sandbox";

    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) {
      return jsonError("Token inválido ou sessão expirada", 401);
    }

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
      .select("id, asaas_subscription_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) return jsonError("Tenant não encontrado", 404);

    const asaasSubscriptionId = String((tenant as TenantRow).asaas_subscription_id || "").trim();
    if (!asaasSubscriptionId) {
      return jsonError("Nenhuma assinatura Asaas vinculada ao tenant.", 400);
    }

    // 1) cancela/deleta no Asaas
    let cancelRes: CancelResponse | null = null;
    try {
      cancelRes = await asaasFetchTyped<CancelResponse>(
        `/subscriptions/${encodeURIComponent(asaasSubscriptionId)}`,
        {
          method: "DELETE",
          env: ASAAS_ENV,
          apiKey: ASAAS_API_KEY,
        }
      );
    } catch (err: unknown) {
      // Se o Asaas já estiver cancelado/deletado, seguimos com a limpeza local.
      console.log("[ASAAS CANCEL] warn: Asaas delete failed", err);
    }

    // 2) atualiza banco local (fonte de verdade)
    const nowIso = new Date().toISOString();

    await supabaseAdmin
      .from("asaas_subscriptions")
      .upsert(
        {
          asaas_subscription_id: asaasSubscriptionId,
          tenant_id: tenantId,
          billing_status: "CANCELED",
          status: "CANCELED",
          current_period_end: null,
          updated_at: nowIso,
        },
        { onConflict: "asaas_subscription_id" }
      );

    // 3) espelha no tenant (para UI/gating)
    await supabaseAdmin
      .from("tenants")
      .update({
        subscription_status: "CANCELED",
        current_period_end: null,
        past_due_since: null,
        // Para permitir nova assinatura, limpamos o vínculo atual
        asaas_subscription_id: null,
      })
      .eq("id", tenantId);

    return NextResponse.json({
      ok: true,
      tenantId,
      asaasSubscriptionId,
      asaas: cancelRes,
      ms: Date.now() - startedAt,
    });
  } catch (err: unknown) {
    console.log("[ASAAS CANCEL] unexpected error:", err);
    return jsonError("Erro inesperado ao cancelar assinatura", 500, {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
