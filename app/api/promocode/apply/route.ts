import { supabaseAdmin } from "../../../../../src/lib/supabaseAdmin";

export const runtime = "nodejs";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeHost(url?: string) {
  try {
    if (!url) return null;
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearer(req);
    if (!token) return Response.json({ error: "Sem token." }, { status: 401 });

    const { data: userData, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr || !userData.user) return Response.json({ error: "Token inválido." }, { status: 401 });

    const userId = userData.user.id;

    const body = await req.json();
    const promocode = String(body?.promocode || "").trim().toUpperCase();

    if (!promocode) return Response.json({ error: "promocode obrigatório." }, { status: 400 });

    console.log("[PROMO] env supabase host:", safeHost(process.env.SUPABASE_URL));
    console.log("[PROMO] userId:", userId);

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: profCount } = await supabaseAdmin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId);

    console.log("[PROMO] profiles count for user:", profCount);

    if (pErr) {
      console.log("[PROMO] profiles query error:", pErr);
      return Response.json({ error: "Erro ao buscar tenant no profiles." }, { status: 500 });
    }

    if (!prof?.tenant_id) {
      return Response.json(
        {
          error: "Usuário sem tenant vinculado.",
          debug: { userId, supabaseHost: safeHost(process.env.SUPABASE_URL), profilesCount: profCount ?? null },
        },
        { status: 400 }
      );
    }

    const tenantId = String(prof.tenant_id);

    const nowIso = new Date().toISOString();

    const { data: code, error: cErr } = await supabaseAdmin
      .from("promo_codes")
      .select("id, promocode, datainicio, datafim, trial_days, active, max_uses, uses_count")
      .eq("promocode", promocode)
      .eq("active", true)
      .lte("datainicio", nowIso)
      .gte("datafim", nowIso)
      .single();

    if (cErr || !code) return Response.json({ error: "Cupom inválido ou fora do período." }, { status: 400 });
    if ((code.uses_count ?? 0) >= (code.max_uses ?? 0)) return Response.json({ error: "Cupom esgotado." }, { status: 400 });

    const { data: existing } = await supabaseAdmin
      .from("promo_redemptions")
      .select("id")
      .eq("promocode_id", code.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existing?.id) return Response.json({ error: "Esse cupom já foi usado por este tenant." }, { status: 400 });

    const days = Number(code.trial_days || 7);
    const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { error: rErr } = await supabaseAdmin.from("promo_redemptions").insert({
      promocode_id: code.id,
      tenant_id: tenantId,
      user_id: userId,
    });

    if (rErr) {
      console.log("[PROMO] redemption insert error:", rErr);
      return Response.json({ error: "Erro ao registrar uso do cupom." }, { status: 500 });
    }

    await supabaseAdmin
      .from("promo_codes")
      .update({ uses_count: (code.uses_count ?? 0) + 1 })
      .eq("id", code.id);

    const { error: tErr } = await supabaseAdmin
      .from("tenants")
      .update({ subscription_status: "TRIAL", trial_ends_at: trialEndsAt, plan: "trial" })
      .eq("id", tenantId);

    if (tErr) return Response.json({ error: "Erro ao ativar trial no tenant." }, { status: 500 });

    return Response.json({ ok: true, trial_ends_at: trialEndsAt });
  } catch (e: any) {
    console.log("[PROMO] apply error:", e);
    return Response.json({ error: e?.message || "Erro interno." }, { status: 500 });
  }
}
