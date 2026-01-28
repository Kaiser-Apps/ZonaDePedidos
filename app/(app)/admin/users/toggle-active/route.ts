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

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const gate = await assertSuperAdmin(supabaseAdmin, jwt);
    if (!gate.ok) return jsonError(gate.message, gate.status);

    const body = await req.json().catch(() => ({} as any));
    const user_id = String(body?.user_id || "").trim();
    const is_active = Boolean(body?.is_active);

    if (!user_id) return jsonError("user_id é obrigatório", 400);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active })
      .eq("user_id", user_id);

    if (error) return jsonError("Falha ao atualizar profiles.is_active", 500, error);

    return NextResponse.json({ ok: true, user_id, is_active });
  } catch (err: any) {
    return jsonError("Erro inesperado ao atualizar usuário", 500, {
      message: String(err?.message || err),
    });
  }
}
