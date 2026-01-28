import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL)
      return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";

    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) {
      return jsonError("Token inválido ou sessão expirada", 401);
    }

    const userId = userResp.user.id;
    const email = (userResp.user.email || "").trim().toLowerCase();
    if (!email) return jsonError("Usuário sem email", 400);

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !prof?.tenant_id) {
      return jsonError("Usuário sem tenant vinculado (profiles.tenant_id)", 400);
    }

    const tenantId = String(prof.tenant_id);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // ✅ Só atualiza billing_email, NÃO atualiza plan
    // (plan é atualizado apenas pelo webhook quando pagamento é recebido)
    const updateData: any = { billing_email: email };

    const { error: upErr } = await supabaseAdmin
      .from("tenants")
      .update(updateData)
      .eq("id", tenantId);

    if (upErr) {
      return jsonError("Falha ao salvar billing_email no tenant", 500, {
        code: upErr.code,
        message: upErr.message,
      });
    }

    return NextResponse.json({ ok: true, tenantId, billing_email: email });
  } catch (err: any) {
    return jsonError("Erro inesperado", 500, {
      message: String(err?.message || err),
    });
  }
}