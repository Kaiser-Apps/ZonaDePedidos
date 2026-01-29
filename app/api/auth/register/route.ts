// app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const USER_LIMIT = 50;

function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>
) {
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

    // ✅ trava dura no backend: não deixa criar novas contas acima do limite
    const { count: currentUsers, error: countErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id", { count: "exact", head: true });

    if (countErr) {
      console.log("[REGISTER] count profiles error:", countErr);
      return jsonError("Erro ao verificar capacidade de usuários.", 500, {
        code: countErr.code,
        message: countErr.message,
        details: (countErr as any)?.details,
      });
    }

    if (Number(currentUsers || 0) >= USER_LIMIT) {
      return jsonError(
        "Limite de 50 contas atingido no momento. Fale com o suporte para liberar novas contas.",
        403,
        { limit: USER_LIMIT, count: Number(currentUsers || 0) }
      );
    }

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const body = (await req
      .json()
      .catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
    const tenantName = String(body?.tenantName ?? "").trim();

    console.log("[REGISTER] raw request body:", JSON.stringify(body));
    console.log("[REGISTER] extracted tenantName:", tenantName, "length:", tenantName.length);
    console.log("[REGISTER] tenantName === MINHA EMPRESA?", tenantName === "MINHA EMPRESA");
    console.log("[REGISTER] tenantName == MINHA EMPRESA?", tenantName == "MINHA EMPRESA");

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
    console.log("[REGISTER] about to insert tenant with name:", { tenantName, type: typeof tenantName, length: tenantName.length });
    const trialDays = 7;
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: t, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: tenantName,
        billing_email: userEmail, // Salva o e-mail do responsável
        subscription_status: "TRIAL",
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEndsAt,
        plan: "free",
      })
      .select("id, name")
      .single();

    if (tErr || !t?.id) {
      console.log("[REGISTER] create tenant error:", tErr);

      const errExtra = (tErr as unknown as {
        code?: string | null;
        message?: string | null;
        details?: string | null;
        hint?: string | null;
      }) || { };

      return jsonError("Falha ao criar tenant", 500, {
        code: errExtra.code ?? (tErr as unknown as { code?: string })?.code,
        message:
          errExtra.message ?? (tErr as unknown as { message?: string })?.message,
        details: errExtra.details,
        hint: errExtra.hint,
      });
    }

    const tenantId = String(t.id);
    console.log("[REGISTER] tenant created:", { tenantId, name: tenantName, savedName: t.name, match: t.name === tenantName });

    // cria profile vinculado
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      tenant_id: tenantId,
      // opcional: já deixa o full_name como null (você pode preencher depois)
      // full_name: null,
      role: "user",
      is_active: true,
    });

    if (pErr) {
      console.log("[REGISTER] create profile error:", pErr);

      const errExtra = (pErr as unknown as {
        code?: string | null;
        message?: string | null;
        details?: string | null;
        hint?: string | null;
      }) || { };

      return jsonError("Falha ao criar profile", 500, {
        code: errExtra.code ?? pErr.code,
        message: errExtra.message ?? pErr.message,
        details: errExtra.details,
        hint: errExtra.hint,
      });
    }

    console.log("[REGISTER] done", { tenantId, ms: Date.now() - startedAt });

    return NextResponse.json({
      ok: true,
      tenantId,
      reused: false,
      ms: Date.now() - startedAt,
    });
  } catch (err: unknown) {
    console.log("[REGISTER] unexpected error:", err);
    return jsonError("Erro inesperado no cadastro", 500, {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}