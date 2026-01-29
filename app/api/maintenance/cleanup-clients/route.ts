import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: unknown) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function parseIntSafe(v: string | null, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parseBool(v: string | null, fallback: boolean) {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "y") return true;
  if (s === "0" || s === "false" || s === "no" || s === "n") return false;
  return fallback;
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function envOr(name: string, fallbackName: string) {
  return process.env[name] || process.env[fallbackName] || "";
}

function requireMaintenanceToken(req: Request) {
  const expected = (process.env.MAINTENANCE_TOKEN || process.env.ASAAS_SYNC_TOKEN || "").trim();
  if (!expected) return; // token opcional

  const got =
    req.headers.get("x-maintenance-token") ||
    req.headers.get("x-sync-token") ||
    req.headers.get("authorization") ||
    "";

  const normalized = got.toLowerCase().startsWith("bearer ")
    ? got.slice(7).trim()
    : got.trim();

  if (!normalized || normalized !== expected) {
    throw new Error("Unauthorized");
  }
}

type ClientRow = {
  id: string;
  tenant_id: string | null;
  nome: string | null;
  telefone: string | null;
  cpf: string | null;
  cnpj: string | null;
  created_at: string | null;
};

// NOTE:
// No schema atual, pagamentos (asaas_payments) NÃO têm client_id.
// O vínculo real de um cliente “usado” é via orders.client_id.

export async function POST(req: Request) {
  try {
    try {
      requireMaintenanceToken(req);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError("Unauthorized", 401, { message });
    }

    const SUPABASE_URL = envOr("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").trim();
    if (!SUPABASE_URL) return jsonError("SUPABASE_URL ausente no env", 500);
    const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const url = new URL(req.url);
    const olderThanMinutes = Math.max(1, parseIntSafe(url.searchParams.get("older_than_minutes"), 30));
    const limit = Math.min(1000, Math.max(1, parseIntSafe(url.searchParams.get("limit"), 200)));
    const dryRun = parseBool(url.searchParams.get("dry_run"), true);
    const debug = url.searchParams.get("debug") === "1";

    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

    // Regra solicitada: cliente criado há mais de X minutos e sem nenhum registro atrelado.
    // Como não existe pagamento atrelado a client_id, usamos orders como vínculo.
    const { data: rawClients, error: cErr } = await supabaseAdmin
      .from("clients")
      .select("id, tenant_id, nome, telefone, cpf, cnpj, created_at")
      .lt("created_at", cutoff)
      .limit(limit);

    if (cErr) return jsonError("Erro ao buscar clients", 500, cErr);

    const clients = (rawClients || []) as unknown as ClientRow[];
    const ids = clients.map((c) => c.id).filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        scanned: 0,
        candidates: 0,
        deletable: 0,
        deleted: 0,
        dryRun,
        olderThanMinutes,
      });
    }

    // Descobre quais têm pedidos associados
    const { data: orders, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("client_id")
      .in("client_id", ids);

    if (oErr) return jsonError("Erro ao buscar orders", 500, oErr);

    const usedIds = new Set(
      (orders || [])
        .map((r: { client_id?: unknown }) => String(r?.client_id || "").trim())
        .filter(Boolean)
    );

    const counts = {
      hasOrders: 0,
      deletable: 0,
    };

    const reasons: Array<{ id: string; reason: string; created_at: string | null }> = [];

    const deletable = clients.filter((c) => {
      const id = String(c.id);
      if (usedIds.has(id)) {
        counts.hasOrders++;
        if (debug && reasons.length < 50) reasons.push({ id, reason: "HAS_ORDERS", created_at: c.created_at });
        return false;
      }

      counts.deletable++;
      return true;
    });

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        scanned: clients.length,
        candidates: clients.length,
        deletable: deletable.length,
        deleted: 0,
        dryRun: true,
        olderThanMinutes,
        cutoff,
        sample: deletable.slice(0, 25),
        debug: debug ? { counts, reasons } : undefined,
      });
    }

    const deletableIds = deletable.map((c) => c.id);

    const { error: dErr } = await supabaseAdmin.from("clients").delete().in("id", deletableIds);
    if (dErr) return jsonError("Erro ao deletar clients", 500, dErr);

    return NextResponse.json({
      ok: true,
      scanned: clients.length,
      candidates: clients.length,
      deletable: deletable.length,
      deleted: deletableIds.length,
      dryRun: false,
      olderThanMinutes,
      cutoff,
      debug: debug ? { counts, reasons } : undefined,
    });
  } catch (err: unknown) {
    console.log("[CLEANUP CLIENTS] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonError("Erro inesperado", 500, { message });
  }
}
