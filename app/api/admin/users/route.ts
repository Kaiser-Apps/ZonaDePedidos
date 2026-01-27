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

export async function GET(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const gate = await assertSuperAdmin(supabaseAdmin, jwt);
    if (!gate.ok) return jsonError(gate.message, gate.status);

    // paginação simples (se quiser, depois dá pra expor via querystring)
    const perPage = 200;
    let page = 1;
    const allUsers: any[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) return jsonError("Falha ao listar usuários (auth)", 500, error);
      const chunk = data?.users || [];
      allUsers.push(...chunk);

      if (chunk.length < perPage) break;
      page += 1;

      // proteção para não loopar infinito
      if (page > 50) break;
    }

    const userIds = allUsers.map((u) => u.id).filter(Boolean);

    // profiles
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, tenant_id, role, is_active, created_at")
      .in("user_id", userIds);

    if (profErr) return jsonError("Falha ao buscar profiles", 500, profErr);

    const profByUser = new Map<string, any>();
    (profiles || []).forEach((p: any) => profByUser.set(String(p.user_id), p));

    const tenantIds = (profiles || [])
      .map((p: any) => p.tenant_id)
      .filter(Boolean)
      .map((x: any) => String(x));

    // tenants
    const { data: tenants, error: tenErr } = await supabaseAdmin
      .from("tenants")
      .select("id, name, subscription_status, trial_ends_at, current_period_end, plan")
      .in("id", tenantIds.length ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);

    if (tenErr) return jsonError("Falha ao buscar tenants", 500, tenErr);

    const tenById = new Map<string, any>();
    (tenants || []).forEach((t: any) => tenById.set(String(t.id), t));

    const rows = allUsers.map((u) => {
      const p = profByUser.get(String(u.id)) || null;
      const t = p?.tenant_id ? tenById.get(String(p.tenant_id)) || null : null;

      const pending_email = !u.email_confirmed_at;
      const has_profile = Boolean(p?.user_id);
      const has_tenant = Boolean(t?.id);

      return {
        user_id: u.id,
        email: u.email || "",
        email_confirmed_at: u.email_confirmed_at || null,
        last_sign_in_at: u.last_sign_in_at || null,
        profile: p
          ? {
              tenant_id: String(p.tenant_id),
              role: p.role || null,
              is_active: Boolean(p.is_active),
              created_at: p.created_at || null,
            }
          : null,
        tenant: t
          ? {
              id: String(t.id),
              name: t.name,
              subscription_status: t.subscription_status || null,
              trial_ends_at: t.trial_ends_at || null,
              current_period_end: t.current_period_end || null,
              plan: t.plan || null,
            }
          : null,
        flags: { pending_email, has_profile, has_tenant },
      };
    });

    return NextResponse.json({
      ok: true,
      rows,
      total: rows.length,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    return jsonError("Erro inesperado ao listar usuários", 500, {
      message: String(err?.message || err),
    });
  }
}
