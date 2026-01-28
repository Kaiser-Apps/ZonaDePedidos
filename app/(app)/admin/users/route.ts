import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function getJwtFromReq(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

async function assertRequesterIsAdmin(supabaseAdmin: any, jwt: string) {
  const { data: userResp, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  if (userErr || !userResp?.user?.id) {
    throw new Error("Token inválido ou sessão expirada");
  }

  const userId = userResp.user.id;

  const { data: prof, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (pErr) throw new Error("Falha ao validar perfil admin");
  if (!prof) throw new Error("Perfil não encontrado");
  if (!prof.is_active) throw new Error("Usuário desativado");
  if (String(prof.role || "").toLowerCase() !== "admin") {
    throw new Error("Acesso negado: apenas admin");
  }

  return { userId };
}

async function listAllAuthUsers(supabaseAdmin: any) {
  // listUsers pagina (depende do tamanho do seu SaaS; aqui fazemos um loop seguro)
  const perPage = 200;
  let page = 1;
  let all: any[] = [];

  while (page <= 50) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw new Error("Falha ao listar usuários do Auth");
    const users = data?.users || [];
    all = all.concat(users);

    if (users.length < perPage) break;
    page++;
  }

  return all;
}

export async function GET(req: Request) {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return jsonError("NEXT_PUBLIC_SUPABASE_URL ausente no env", 500);
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return jsonError("SUPABASE_SERVICE_ROLE_KEY ausente no env", 500);

    const jwt = getJwtFromReq(req);
    if (!jwt) return jsonError("Authorization Bearer token ausente", 401);

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    await assertRequesterIsAdmin(supabaseAdmin, jwt);

    // 1) Auth users
    const authUsers = await listAllAuthUsers(supabaseAdmin);

    // 2) Profiles + tenant
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, tenant_id, role, is_active, created_at")
      .order("created_at", { ascending: false });

    if (profErr) {
      return jsonError("Falha ao carregar profiles", 500, {
        code: profErr.code,
        message: profErr.message,
      });
    }

    const tenantIds = Array.from(new Set((profiles || []).map((p: any) => p.tenant_id).filter(Boolean)));

    const { data: tenants, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, name, subscription_status, trial_ends_at, current_period_end, plan")
      .in("id", tenantIds.length ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);

    if (tErr) {
      return jsonError("Falha ao carregar tenants", 500, {
        code: tErr.code,
        message: tErr.message,
      });
    }

    const profMap = new Map<string, any>();
    for (const p of profiles || []) profMap.set(String(p.user_id), p);

    const tenantMap = new Map<string, any>();
    for (const t of tenants || []) tenantMap.set(String(t.id), t);

    // 3) Merge
    const rows = authUsers
      .map((u: any) => {
        const p = profMap.get(String(u.id)) || null;
        const tenant = p?.tenant_id ? tenantMap.get(String(p.tenant_id)) || null : null;

        const emailConfirmed = Boolean(u.email_confirmed_at);
        const lastSignInAt = u.last_sign_in_at || null;

        return {
          user_id: u.id,
          email: (u.email || "").toLowerCase(),
          email_confirmed_at: u.email_confirmed_at || null,
          last_sign_in_at: lastSignInAt,

          profile: p
            ? {
                tenant_id: String(p.tenant_id),
                role: p.role,
                is_active: Boolean(p.is_active),
                created_at: p.created_at || null,
              }
            : null,

          tenant: tenant
            ? {
                id: String(tenant.id),
                name: tenant.name,
                subscription_status: tenant.subscription_status,
                trial_ends_at: tenant.trial_ends_at,
                current_period_end: tenant.current_period_end,
                plan: tenant.plan,
              }
            : null,

          // campos úteis pro front
          flags: {
            pending_email: !emailConfirmed,
            has_profile: Boolean(p),
            has_tenant: Boolean(tenant),
          },
        };
      })
      // ordena: mais recentes no topo (por last_sign_in ou created_at do profile)
      .sort((a: any, b: any) => {
        const ad = new Date(a.last_sign_in_at || a.profile?.created_at || 0).getTime();
        const bd = new Date(b.last_sign_in_at || b.profile?.created_at || 0).getTime();
        return bd - ad;
      });

    return NextResponse.json({
      ok: true,
      rows,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.log("[ADMIN][USERS] error:", err);
    return jsonError("Erro ao listar usuários", 500, {
      message: String(err?.message || err),
    });
  }
}
