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

export async function GET() {
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

    // Conta quantos usuários "ativos" do app já existem.
    // Aqui usamos a tabela `profiles`, pois cada conta completa cria 1 profile.
    const { count, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id", { count: "exact", head: true });

    if (error) {
      console.log("[AUTH_CAPACITY] count profiles error:", error);
      return jsonError("Falha ao verificar capacidade", 500, {
        code: error.code,
        message: error.message,
        details: (error as unknown as { details?: string | null })?.details,
      });
    }

    const current = Number(count || 0);
    const remaining = Math.max(0, USER_LIMIT - current);

    return NextResponse.json({
      ok: true,
      limit: USER_LIMIT,
      count: current,
      remaining,
      isFull: current >= USER_LIMIT,
    });
  } catch (err: unknown) {
    console.log("[AUTH_CAPACITY] unexpected error:", err);
    return jsonError("Erro inesperado", 500, {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
