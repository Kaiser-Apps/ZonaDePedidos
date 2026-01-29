
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ASAAS_API_KEY = process.env.ASAAS_API_KEY || "";
const ASAAS_BASE_URL = (process.env.ASAAS_BASE_URL || "https://api.asaas.com").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function upper(v: any) {
  return String(v || "").trim().toUpperCase();
}

function isPaidStatus(v: any) {
  const s = upper(v);
  return s === "RECEIVED" || s === "CONFIRMED";
}

function dateOnlyToIso(dateOnly: any): string | null {
  const s = String(dateOnly || "").trim();
  if (!s) return null;
  // Asaas geralmente manda YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeBillingStatus(subStatus: any, hasPaidPayment: boolean) {
  const s = upper(subStatus);
  if (!s) return null;
  if (s === "ACTIVE") return hasPaidPayment ? "ACTIVE" : "PENDING";
  if (s === "OVERDUE") return "PAST_DUE";
  if (s === "CANCELED") return "CANCELED";
  if (s === "INACTIVE" || s === "DELETED") return "INACTIVE";
  return null;
}

function parseMinutes(v: string | null): number {
  if (!v) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function isOlderThanMinutes(iso: any, minutes: number) {
  if (!minutes) return false;
  const s = String(iso || "").trim();
  if (!s) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > minutes * 60 * 1000;
}

export async function POST(req: Request) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 🔒 Proteção opcional: se ASAAS_SYNC_TOKEN estiver setado, exige token no header
  const expectedToken = (process.env.ASAAS_SYNC_TOKEN || "").trim();
  if (expectedToken) {
    const got =
      req.headers.get("x-sync-token") ||
      req.headers.get("x-webhook-token") ||
      req.headers.get("authorization") ||
      "";
    const normalized = got.toLowerCase().startsWith("bearer ") ? got.slice(7).trim() : got.trim();
    if (!normalized || normalized !== expectedToken) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  const urlObj = new URL(req.url);
  const cleanupMinutes =
    parseMinutes(urlObj.searchParams.get("cleanup_unpaid_minutes")) ||
    parseMinutes(urlObj.searchParams.get("cleanup"));

  // Buscar todos tenants para possível associação
  const { data: tenants, error: tenantsErr } = await supabase
    .from("tenants")
    .select("id, asaas_customer_id, billing_email, subscription_status");
  if (tenantsErr) {
    return NextResponse.json({ ok: false, message: "Erro ao buscar tenants", tenantsErr }, { status: 500 });
  }
  // Mapa para lookup rápido
  const tenantByCustomerId = new Map(
    (tenants || [])
      .filter(t => t.asaas_customer_id)
      .map(t => [t.asaas_customer_id, t])
  );

  let total = 0, updated = 0, errors = [] as any[];
  let cleaned = 0;
  let canceled = 0;
  let page = 0, hasMore = true;
  const limit = 100;

  while (hasMore) {
    try {
      const url = `${ASAAS_BASE_URL}/v3/subscriptions?limit=${limit}&offset=${page * limit}`;
      const subsRes = await fetch(url, {
        headers: { "access_token": ASAAS_API_KEY },
      });
      const subsJson = await subsRes.json();
      if (!subsRes.ok) throw new Error(JSON.stringify(subsJson));
      const data = subsJson.data || [];
      for (const sub of data) {
        total++;
        // Tenta associar ao tenant local
        const tenant = tenantByCustomerId.get(sub.customer);
        const tenant_id = tenant?.id || null;
        let email = tenant?.billing_email || null;
        // Se não houver tenant local, busca o e-mail do cliente no Asaas
        if (!email) {
          try {
            const custRes = await fetch(`${ASAAS_BASE_URL}/v3/customers/${sub.customer}`, {
              headers: { "access_token": ASAAS_API_KEY },
            });
            if (custRes.ok) {
              const custJson = await custRes.json();
              email = custJson.email || null;
            }
          } catch (e) {
            errors.push({ subId: sub.id, customerId: sub.customer, err: 'Erro ao buscar email do cliente' });
          }
        }

        // Buscar nome do link de pagamento, se houver paymentLink/paymentLinkId
        let payment_link_name = null;
        const paymentLinkId = sub.paymentLink || sub.paymentLinkId || null;
        if (paymentLinkId) {
          try {
            const linkRes = await fetch(`${ASAAS_BASE_URL}/v3/paymentLinks/${paymentLinkId}`, {
              headers: { "access_token": ASAAS_API_KEY },
            });
            if (linkRes.ok) {
              const linkJson = await linkRes.json();
              payment_link_name = linkJson.name || linkJson.description || null;
            }
          } catch (e) {
            errors.push({ subId: sub.id, paymentLinkId, err: 'Erro ao buscar nome do link' });
          }
        }

        // Buscar último pagamento recebido da assinatura
        let last_payment_date: string | null = null;
        let last_payment_value: number | null = null;
        let last_payment_id: string | null = null;
        let last_invoice_url: string | null = null;
        let hasPaidPayment = false;
        try {
          const payRes = await fetch(`${ASAAS_BASE_URL}/v3/payments?subscription=${sub.id}&limit=5&offset=0&sort=paymentDate&order=desc`, {
            headers: { "access_token": ASAAS_API_KEY },
          });
          if (payRes.ok) {
            const payJson = await payRes.json();
            const items = Array.isArray(payJson?.data) ? payJson.data : [];
            const lastPaid = items.find((p: any) => isPaidStatus(p?.status) && (p?.paymentDate || p?.confirmedDate || p?.clientPaymentDate || p?.creditDate)) || null;
            if (lastPaid) {
              hasPaidPayment = true;
              last_payment_date = String(lastPaid.paymentDate || lastPaid.confirmedDate || lastPaid.clientPaymentDate || lastPaid.creditDate || "") || null;
              last_payment_value = typeof lastPaid.value === "number" ? lastPaid.value : lastPaid.value ? Number(lastPaid.value) : null;
              last_payment_id = lastPaid.id ? String(lastPaid.id) : null;
              last_invoice_url = lastPaid.invoiceUrl ? String(lastPaid.invoiceUrl) : null;
            }
          }
        } catch (e) {
          errors.push({ subId: sub.id, err: 'Erro ao buscar último pagamento' });
        }

        const billing_status = normalizeBillingStatus(sub.status, hasPaidPayment);
        const current_period_end = dateOnlyToIso(sub.nextDueDate || null);

        const shouldCleanup =
          cleanupMinutes > 0 &&
          !hasPaidPayment &&
          billing_status === "PENDING" &&
          isOlderThanMinutes(sub.createdAt || sub.created_at || null, cleanupMinutes);

        if (shouldCleanup) {
          // 1) tenta cancelar no Asaas (best-effort)
          try {
            const delRes = await fetch(`${ASAAS_BASE_URL}/v3/subscriptions/${encodeURIComponent(String(sub.id))}`, {
              method: "DELETE",
              headers: { "access_token": ASAAS_API_KEY },
            });
            if (delRes.ok) {
              canceled++;
            } else {
              const delJson = await delRes.json().catch(() => ({}));
              errors.push({ subId: sub.id, action: "cancel", status: delRes.status, body: delJson });
            }
          } catch (e: any) {
            errors.push({ subId: sub.id, action: "cancel", err: String(e?.message || e) });
          }

          // 2) remove do banco local
          const { error: delLocalErr } = await supabase
            .from("asaas_subscriptions")
            .delete()
            .eq("asaas_subscription_id", String(sub.id));

          if (delLocalErr) {
            errors.push({ subId: sub.id, action: "delete_local", delLocalErr });
          } else {
            cleaned++;
          }

          // 3) se estava vinculado a um tenant, limpa referência com segurança
          if (tenant_id) {
            const { data: tRow } = await supabase
              .from("tenants")
              .select("id, asaas_subscription_id, subscription_status")
              .eq("id", tenant_id)
              .maybeSingle();

            const linkedId = String((tRow as any)?.asaas_subscription_id || "").trim();
            const st = upper((tRow as any)?.subscription_status);

            if (linkedId === String(sub.id) && (st === "PENDING" || st === "INACTIVE" || !st)) {
              const { error: clearErr } = await supabase
                .from("tenants")
                .update({
                  subscription_status: "INACTIVE",
                  asaas_subscription_id: null,
                  current_period_end: null,
                  past_due_since: null,
                })
                .eq("id", tenant_id);

              if (clearErr) errors.push({ subId: sub.id, tenant_id, action: "clear_tenant", clearErr });
            }
          }

          // pula o upsert pois limpamos
          continue;
        }

        const { error: upErr } = await supabase
          .from("asaas_subscriptions")
          .upsert(
            {
              asaas_subscription_id: sub.id,
              asaas_customer_id: sub.customer,
              tenant_id,
              email,
              cycle: sub.cycle,
              status: sub.status,
              next_due_date: sub.nextDueDate || null,
              last_payment_date,
              last_payment_value,
              payment_link_name,
              billing_status,
              current_period_end,
              last_payment_id,
              last_invoice_url,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "asaas_subscription_id" }
          );
        if (!upErr) updated++;
        else errors.push({ subId: sub.id, upErr });

        // Espelha no tenant SOMENTE quando temos pagamento confirmado (evita ativação indevida)
        if (!upErr && tenant_id && billing_status === "ACTIVE") {
          const { error: tenErr } = await supabase
            .from("tenants")
            .update({
              subscription_status: "ACTIVE",
              past_due_since: null,
              trial_ends_at: null,
              current_period_end,
              asaas_subscription_id: String(sub.id),
            })
            .eq("id", tenant_id);

          if (tenErr) {
            errors.push({ subId: sub.id, tenant_id, tenErr });
          }
        }
      }
      hasMore = data.length === limit;
      page++;
    } catch (err: any) {
      errors.push({ page, err: String(err) });
      break;
    }
  }

  return NextResponse.json({ ok: true, total, updated, cleaned, canceled, cleanupMinutes, errors });
}
