import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type BillingStatus = "PENDING" | "ACTIVE" | "PAST_DUE" | "INACTIVE" | "CANCELED" | "TRIAL";

type TenantBilling = {
  id: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: string | null;
  cnpj?: string | null;
  past_due_since?: string | null;
  grace_days?: number | null;
  asaas_subscription_id?: string | null;
};

type AsaasSubscriptionRow = {
  billing_status?: unknown;
  status?: unknown;
  cycle?: unknown;
  next_due_date?: unknown;
  current_period_end?: unknown;
  updated_at?: unknown;
};

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function upper(v: unknown) {
  return String(v || "").trim().toUpperCase();
}

function normalizePlan(planCode: unknown): string | null {
  const p = upper(planCode).toLowerCase();
  if (!p) return null;
  if (p === "monthly" || p === "month") return "MONTHLY";
  if (p === "yearly" || p === "year") return "YEARLY";
  if (p === "MONTHLY".toLowerCase()) return "MONTHLY";
  if (p === "YEARLY".toLowerCase()) return "YEARLY";
  return null;
}

function normalizeStatus(status: unknown): BillingStatus | null {
  const s = upper(status);
  if (!s) return null;
  if (
    s === "PENDING" ||
    s === "ACTIVE" ||
    s === "PAST_DUE" ||
    s === "INACTIVE" ||
    s === "CANCELED" ||
    s === "TRIAL"
  ) {
    return s as BillingStatus;
  }
  // fallback: qualquer outro vira INACTIVE
  return "INACTIVE";
}

export async function GET(req: Request) {
  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

    // 1) sempre lemos tenants para trial/grace (campos ainda vivem lá)
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, subscription_status, trial_ends_at, current_period_end, plan, cnpj, past_due_since, grace_days, asaas_subscription_id"
      )
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) return jsonError("Tenant não encontrado", 404);

    // 2) fonte de verdade: asaas_subscriptions (billing_status/current_period_end)
    let asaasSub: AsaasSubscriptionRow | null = null;
    try {
      const asaasSubscriptionId = String((tenant as any)?.asaas_subscription_id || "").trim();

      if (asaasSubscriptionId) {
        const { data: subRow } = await supabaseAdmin
          .from("asaas_subscriptions")
          .select("billing_status, status, cycle, next_due_date, current_period_end, updated_at")
          .eq("asaas_subscription_id", asaasSubscriptionId)
          .maybeSingle();
        asaasSub = (subRow as unknown as AsaasSubscriptionRow) || null;
      }

      if (!asaasSub) {
        const { data: subRow } = await supabaseAdmin
          .from("asaas_subscriptions")
          .select("billing_status, status, cycle, next_due_date, current_period_end, updated_at")
          .eq("tenant_id", tenantId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        asaasSub = (subRow as unknown as AsaasSubscriptionRow) || null;
      }
    } catch {
      asaasSub = null;
    }

    const statusFromAsaas = normalizeStatus(asaasSub?.billing_status) || normalizeStatus(asaasSub?.status);
    const planFromAsaas = normalizePlan(asaasSub?.cycle);
    const periodEndFromAsaas =
      asaasSub?.current_period_end
        ? String(asaasSub.current_period_end)
        : asaasSub?.next_due_date
          ? String(asaasSub.next_due_date)
          : null;

    // regra: se asaas_subscriptions tiver status, ela manda; senão cai no tenants
    const effectiveStatus = statusFromAsaas || normalizeStatus(tenant.subscription_status) || "INACTIVE";
    const effectivePlan = planFromAsaas || (tenant.plan ? String(tenant.plan) : null);
    const effectivePeriodEnd = periodEndFromAsaas || (tenant.current_period_end ? String(tenant.current_period_end) : null);

    const tenantBilling: TenantBilling = {
      id: String(tenant.id),
      subscription_status: effectiveStatus,
      trial_ends_at: tenant.trial_ends_at ? String(tenant.trial_ends_at) : null,
      current_period_end: effectivePeriodEnd,
      plan: effectivePlan,
      cnpj: tenant.cnpj ? String(tenant.cnpj) : null,
      past_due_since: tenant.past_due_since ? String(tenant.past_due_since) : null,
      grace_days: typeof tenant.grace_days === "number" ? tenant.grace_days : tenant.grace_days ? Number(tenant.grace_days) : null,
      asaas_subscription_id: (tenant as any)?.asaas_subscription_id ? String((tenant as any).asaas_subscription_id) : null,
    };

    return NextResponse.json({
      ok: true,
      tenantId,
      tenantBilling,
      sources: {
        asaas_subscriptions: asaasSub
          ? { status: statusFromAsaas, plan: planFromAsaas, current_period_end: periodEndFromAsaas }
          : null,
        tenants: {
          status: tenant.subscription_status || null,
          plan: tenant.plan || null,
          current_period_end: tenant.current_period_end || null,
        },
      },
    });
  } catch (err: unknown) {
    console.log("[BILLING STATUS] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonError("Erro ao carregar status", 500, { message });
  }
}
