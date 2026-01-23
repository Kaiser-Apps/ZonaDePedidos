// app/api/promocode/apply/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  promocode?: string;
};

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function normalizeCode(code: any) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    // ✅ Cupom vitalício (família) via ENV (prioridade máxima)
    const FAMILY_LIFETIME_COUPON = normalizeCode(process.env.FAMILY_LIFETIME_COUPON || "");
    const FAMILY_LIFETIME_EMAILS = String(process.env.FAMILY_LIFETIME_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

    const code = normalizeCode(body.promocode);
    if (!code) return jsonError("Digite um cupom.", 400);

    console.log("[PROMO] apply start", { code });

    // 1) resolve usuário pelo JWT
    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) {
      console.log("[PROMO] auth.getUser error:", userErr);
      return jsonError("Token inválido ou sessão expirada", 401);
    }

    const userId = userResp.user.id;
    const userEmail = (userResp.user.email || "").toLowerCase();
    console.log("[PROMO] user", { userId, userEmail });

    // 2) resolve tenant pelo profile
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !prof?.tenant_id) {
      console.log("[PROMO] profile error:", profErr);
      return jsonError("Usuário sem tenant vinculado (profiles.tenant_id)", 400);
    }

    const tenantId = String(prof.tenant_id);
    console.log("[PROMO] user -> tenant resolved", { userId, tenantId });

    // =========================
    // ✅ A) CUPOM VITALÍCIO (família) - não consome promo_codes
    // =========================
    if (FAMILY_LIFETIME_COUPON && code === FAMILY_LIFETIME_COUPON) {
      if (FAMILY_LIFETIME_EMAILS.length > 0 && !FAMILY_LIFETIME_EMAILS.includes(userEmail)) {
        return jsonError("Este cupom não é permitido para este e-mail.", 403);
      }

      console.log("[PROMO] applying LIFETIME coupon", { tenantId, userEmail });

      const { error: upErr } = await supabaseAdmin
        .from("tenants")
        .update({
          subscription_status: "ACTIVE",
          plan: "FAMILY",
          trial_ends_at: null,
          current_period_end: null, // vitalício
        })
        .eq("id", tenantId);

      if (upErr) {
        console.log("[PROMO] lifetime update error:", upErr);
        return jsonError("Falha ao aplicar cupom vitalício", 500, {
          code: upErr.code,
          message: upErr.message,
        });
      }

      return NextResponse.json({
        ok: true,
        type: "LIFETIME",
        tenantId,
        subscription_status: "ACTIVE",
        plan: "FAMILY",
        trial_ends_at: null,
        current_period_end: null,
        ms: Date.now() - startedAt,
      });
    }

    // =========================
    // ✅ B) OUTROS CUPONS (tabela promo_codes)
    // Via RPC atômico: redeem_promocode(promocode, tenant_id, user_id)
    // =========================
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("redeem_promocode", {
      p_promocode: code,
      p_tenant_id: tenantId,
      p_user_id: userId,
    });

    if (rpcErr) {
      console.log("[PROMO] rpc error:", rpcErr);
      return jsonError("Erro ao validar cupom (RPC).", 500, {
        code: rpcErr.code,
        message: rpcErr.message,
        details: rpcErr.details,
        hint: rpcErr.hint,
      });
    }

    // rpcData é jsonb retornado da função
    const ok = Boolean(rpcData?.ok);
    if (!ok) {
      const msg = rpcData?.message || "Cupom inválido.";
      console.log("[PROMO] rejected", rpcData);
      return jsonError(msg, 400, { rpc: rpcData });
    }

    console.log("[PROMO] applied", rpcData);

    return NextResponse.json({
      ...rpcData,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[PROMO] unexpected error:", err);
    return jsonError("Erro inesperado ao aplicar cupom", 500, {
      message: String(err?.message || err),
    });
  }
}
