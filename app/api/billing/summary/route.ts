import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

export async function GET(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userResp?.user?.id) return jsonError("Token inválido ou sessão expirada", 401);

    const userId = userResp.user.id;

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !prof?.tenant_id) return jsonError("Usuário sem tenant vinculado", 400);
    const tenantId = String(prof.tenant_id);

    const { data, error } = await supabaseAdmin
      .from("asaas_payments")
      .select("value, net_value, status, payment_date")
      .eq("tenant_id", tenantId);

    if (error) {
      const msg = String(error.message || "");
      const code = String((error as any).code || "");
      const looksLikeMissingTable =
        code === "42P01" ||
        /relation\s+"?asaas_payments"?\s+does\s+not\s+exist/i.test(msg) ||
        /asaas_payments/i.test(msg);

      if (looksLikeMissingTable) {
        return NextResponse.json({
          ok: true,
          tenantId,
          setupRequired: true,
          message: "Tabela asaas_payments ainda não existe. Execute o SQL de supabase/asaas_payments.sql",
          totals: null,
          ms: Date.now() - startedAt,
        });
      }

      return jsonError("Falha ao carregar resumo financeiro", 500, {
        message: msg,
        code,
      });
    }

    const rows = data || [];
    const received = rows.filter((r: any) => {
      const st = String(r?.status || "").toUpperCase();
      return st === "RECEIVED" || st === "CONFIRMED";
    });

    const totalGross = received.reduce((acc: number, r: any) => acc + (Number(r?.value) || 0), 0);
    const totalNet = received.reduce((acc: number, r: any) => acc + (Number(r?.net_value) || 0), 0);

    const lastPaymentDate = received
      .map((r: any) => String(r?.payment_date || ""))
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null;

    return NextResponse.json({
      ok: true,
      tenantId,
      totals: {
        received_count: received.length,
        received_gross: totalGross,
        received_net: totalNet,
        last_payment_date: lastPaymentDate,
      },
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    return jsonError("Erro inesperado no resumo financeiro", 500, {
      message: String(err?.message || err),
    });
  }
}
