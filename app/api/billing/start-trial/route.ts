import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
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

function upper(v: unknown) {
  return String(v || "").trim().toUpperCase();
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

type TenantRow = {
  id: string;
  subscription_status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
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

    if (profErr || !prof?.tenant_id) return jsonError("Usuário sem tenant vinculado", 400);
    const tenantId = String(prof.tenant_id);

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, subscription_status, trial_started_at, trial_ends_at, current_period_end")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) return jsonError("Tenant não encontrado", 404);

    const t = tenant as unknown as TenantRow;
    const status = upper(t?.subscription_status || "INACTIVE");
    const currentPeriodEnd = t?.current_period_end ? String(t.current_period_end) : null;
    const trialEndsAt = t?.trial_ends_at ? String(t.trial_ends_at) : null;
    const trialStartedAt = t?.trial_started_at ? String(t.trial_started_at) : null;

    // Já ativo/possui período vigente → não inicia trial
    if (status === "ACTIVE" || currentPeriodEnd) {
      return NextResponse.json({ ok: true, tenantId, started: false, reason: "already_active" });
    }

    // Trial já iniciado uma vez → não reinicia
    if (trialStartedAt || trialEndsAt) {
      return NextResponse.json({
        ok: true,
        tenantId,
        started: false,
        reason: "trial_already_used",
        trial_started_at: trialStartedAt,
        trial_ends_at: trialEndsAt,
      });
    }

    const patch: Record<string, unknown> = {
      subscription_status: "TRIAL",
      trial_started_at: new Date().toISOString(),
      trial_ends_at: addDaysIso(7),
      updated_by: userId,
    };

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("tenants")
      .update(patch)
      .eq("id", tenantId)
      .select("id, subscription_status, trial_started_at, trial_ends_at")
      .maybeSingle();

    if (uErr) {
      const e = uErr as unknown as { code?: string | null; message?: string };
      return jsonError("Falha ao iniciar trial", 500, {
        code: e?.code || null,
        message: String(e?.message || uErr.message),
      });
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      started: true,
      tenant: updated || null,
    });
  } catch (err: unknown) {
    console.log("[BILLING START TRIAL] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonError("Erro ao iniciar trial", 500, { message });
  }
}
