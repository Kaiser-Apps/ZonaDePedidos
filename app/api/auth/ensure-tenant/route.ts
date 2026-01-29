import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const USER_LIMIT = 50;

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

type EnsureTenantOk = {
  ok: true;
  tenantId: string;
  created: boolean;
};

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL)
      return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    // capacidade
    const { count: currentUsers, error: countErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id", { count: "exact", head: true });

    if (countErr) {
      console.log("[ENSURE TENANT] count profiles error:", countErr);
      return jsonError("Erro ao verificar capacidade de usuários.", 500, {
        code: countErr.code,
        message: countErr.message,
      });
    }

    if (Number(currentUsers || 0) >= USER_LIMIT) {
      return jsonError(
        "Limite de 50 contas atingido no momento. Fale com o suporte para liberar novas contas.",
        403,
        { limit: USER_LIMIT, count: Number(currentUsers || 0) }
      );
    }

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) {
      console.log("[ENSURE TENANT] auth.getUser error:", userErr);
      return jsonError("Token inválido ou sessão expirada", 401);
    }

    const userId = userResp.user.id;
    const userEmail = (userResp.user.email || "").toLowerCase();
    const meta = (userResp.user.user_metadata || {}) as Record<string, unknown>;
    const tenantName = String(meta?.tenantName ?? "").trim();

    // Já tem tenant?
    const { data: existingProfile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr) {
      console.log("[ENSURE TENANT] profiles error:", profErr);
      return jsonError("Erro ao verificar perfil.", 500, {
        code: profErr.code,
        message: profErr.message,
      });
    }

    if (existingProfile?.tenant_id) {
      const tenantId = String(existingProfile.tenant_id);
      const payload: EnsureTenantOk = { ok: true, tenantId, created: false };
      return NextResponse.json(payload);
    }

    if (!tenantName) {
      return jsonError(
        "Conta sem empresa vinculada. Refaça o cadastro informando o nome da empresa.",
        400,
        { code: "missing_tenant_name" }
      );
    }

    // cria tenant
    const trialDays = 7;
    const trialEndsAt = new Date(
      Date.now() + trialDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: t, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: tenantName,
        billing_email: userEmail,
        subscription_status: "TRIAL",
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEndsAt,
        plan: "free",
      })
      .select("id")
      .single();

    if (tErr || !t?.id) {
      console.log("[ENSURE TENANT] create tenant error:", tErr);
      return jsonError("Falha ao criar tenant", 500, {
        code: tErr?.code,
        message: tErr?.message,
        details: (tErr as { details?: string })?.details,
      });
    }

    const tenantId = String(t.id);

    // upsert profile (caso já exista linha sem tenant_id)
    const { error: upErr } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        role: "user",
        is_active: true,
      },
      { onConflict: "user_id" }
    );

    if (upErr) {
      console.log("[ENSURE TENANT] upsert profile error:", upErr);
      return jsonError("Falha ao criar/vincular profile", 500, {
        code: upErr.code,
        message: upErr.message,
        details: (upErr as { details?: string })?.details,
      });
    }

    console.log("[ENSURE TENANT] created", { userId, tenantId, ms: Date.now() - startedAt });

    const payload: EnsureTenantOk = { ok: true, tenantId, created: true };
    return NextResponse.json(payload);
  } catch (err: unknown) {
    console.log("[ENSURE TENANT] unexpected error:", err);
    return jsonError("Erro inesperado ao garantir tenant", 500, {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
