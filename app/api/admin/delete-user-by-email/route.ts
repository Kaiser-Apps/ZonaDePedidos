import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function normalizeEmail(s: any) {
  return String(s || "").trim().toLowerCase();
}

function parseAdminEmails() {
  return String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function assertSuperAdmin(supabaseAdmin: any, jwt: string) {
  const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  if (userErr || !userResp?.user?.email) {
    return { ok: false, status: 401, message: "Token inválido ou sessão expirada" };
  }

  const email = normalizeEmail(userResp.user.email);
  const admins = parseAdminEmails();

  if (admins.length === 0) {
    return { ok: false, status: 500, message: "SUPER_ADMIN_EMAILS não configurado" };
  }

  if (!admins.includes(email)) {
    return { ok: false, status: 403, message: "Acesso negado: apenas Super Admin" };
  }

  return { ok: true, email };
}

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error };

    const users = data?.users || [];
    const found = users.find((u: any) => normalizeEmail(u.email) === email);
    if (found) return { user: found, error: null };

    if (users.length < perPage) break;
    page += 1;
    if (page > 200) break;
  }

  return { user: null, error: null };
}

async function mustOk(step: string, res: { error: any }) {
  if (res.error) {
    throw { step, error: res.error };
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const gate = await assertSuperAdmin(supabaseAdmin, jwt);
    if (!gate.ok) return jsonError(gate.message, gate.status);

    const body = await req.json().catch(() => ({} as any));
    const email = normalizeEmail(body?.email);
    if (!email) return jsonError("email é obrigatório", 400);

    console.log("[ADMIN] delete start", { email, by: gate.email });

    // 1) acha user no Auth (paginando)
    const { user, error: findErr } = await findAuthUserByEmail(supabaseAdmin, email);
    if (findErr) return jsonError("Falha ao listar usuários (auth)", 500, findErr);
    if (!user?.id) return jsonError("Usuário não encontrado no Auth", 404, { email });

    const userId = String(user.id);

    // 2) profile -> tenant
    const profRes = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profRes.error) return jsonError("Falha ao buscar profile", 500, profRes.error);

    const tenantId = profRes.data?.tenant_id ? String(profRes.data.tenant_id) : null;

    console.log("[ADMIN] delete resolved", { userId, tenantId });

    // 3) deletar dados do tenant
    try {
      if (tenantId) {
        await mustOk(
          "delete orders",
          await supabaseAdmin.from("orders").delete().eq("tenant_id", tenantId)
        );

        await mustOk(
          "delete clients",
          await supabaseAdmin.from("clients").delete().eq("tenant_id", tenantId)
        );

        await mustOk(
          "delete promo_redemptions by tenant",
          await supabaseAdmin.from("promo_redemptions").delete().eq("tenant_id", tenantId)
        );

        await mustOk(
          "delete profiles by tenant",
          await supabaseAdmin.from("profiles").delete().eq("tenant_id", tenantId)
        );

        await mustOk(
          "delete tenant",
          await supabaseAdmin.from("tenants").delete().eq("id", tenantId)
        );
      } else {
        await mustOk(
          "delete profile by user_id",
          await supabaseAdmin.from("profiles").delete().eq("user_id", userId)
        );
      }
    } catch (e: any) {
      console.log("[ADMIN] delete step failed", e);
      return jsonError("Falha ao deletar dados (DB)", 500, {
        step: e?.step,
        code: e?.error?.code,
        message: e?.error?.message,
        details: e?.error?.details,
        hint: e?.error?.hint,
      });
    }

    // 4) apagar do Auth por último
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      return jsonError("Falha ao deletar usuário do Auth", 500, {
        code: delAuthErr.code,
        message: delAuthErr.message,
      });
    }

    console.log("[ADMIN] delete done", { email, userId, tenantId });

    return NextResponse.json({
      ok: true,
      email,
      userId,
      tenantId,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[ADMIN] delete unexpected", err);
    return jsonError("Erro inesperado ao deletar usuário", 500, {
      message: String(err?.message || err),
    });
  }
}
