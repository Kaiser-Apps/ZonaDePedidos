// app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const body = await req.json().catch(() => ({} as any));
    const tenantName = String(body?.tenantName || "").trim();

    console.log("[REGISTER] body raw:", body);
    console.log("[REGISTER] tenantName parsed:", tenantName);

    if (!tenantName) return jsonError("tenantName é obrigatório.", 400);

    console.log("[REGISTER] start", { tenantName });

    // descobre usuário pelo token
    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) {
      console.log("[REGISTER] auth.getUser error:", userErr);
      return jsonError("Token inválido ou sessão expirada", 401);
    }

    const userId = userResp.user.id;
    const userEmail = (userResp.user.email || "").toLowerCase();

    console.log("[REGISTER] user", { userId, userEmail });

    // ✅ se já tiver profile, NÃO reaproveita silenciosamente
    // (isso é o que causava "Minha Empresa" aparecer, pois você achava que criou novo,
    // mas na prática estava reutilizando o tenant antigo)
    const { data: existingProfile, error: existingErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingErr) {
      console.log("[REGISTER] existing profile check error:", existingErr);
      return jsonError("Erro ao verificar perfil existente.", 500, {
        code: existingErr.code,
        message: existingErr.message,
      });
    }

    if (existingProfile?.tenant_id) {
      const existingTenantId = String(existingProfile.tenant_id);
      console.log("[REGISTER] user already has tenant:", existingTenantId);

      return jsonError("Este usuário já possui empresa cadastrada. Faça login.", 409, {
        tenantId: existingTenantId,
      });
    }

    // cria tenant
    const { data: t, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: tenantName,
        subscription_status: "INACTIVE",
        plan: "free",
      })
      .select("id")
      .single();

    if (tErr || !t?.id) {
      console.log("[REGISTER] create tenant error:", tErr);
      return jsonError("Falha ao criar tenant", 500, {
        code: tErr?.code,
        message: tErr?.message,
        details: (tErr as any)?.details,
        hint: (tErr as any)?.hint,
      });
    }

    const tenantId = String(t.id);
    console.log("[REGISTER] tenant created:", { tenantId, name: tenantName });

    // cria profile vinculado
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      tenant_id: tenantId,
      // opcional: já deixa o full_name como null (você pode preencher depois)
      // full_name: null,
      role: "admin",
      is_active: true,
    });

    if (pErr) {
      console.log("[REGISTER] create profile error:", pErr);
      return jsonError("Falha ao criar profile", 500, {
        code: pErr.code,
        message: pErr.message,
        details: (pErr as any)?.details,
        hint: (pErr as any)?.hint,
      });
    }

    console.log("[REGISTER] done", { tenantId, ms: Date.now() - startedAt });

    return NextResponse.json({
      ok: true,
      tenantId,
      reused: false,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[REGISTER] unexpected error:", err);
    return jsonError("Erro inesperado no cadastro", 500, {
      message: String(err?.message || err),
    });
  }
}
