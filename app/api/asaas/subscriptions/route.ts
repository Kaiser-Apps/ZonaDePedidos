// app/api/asaas/subscriptions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type QueryParams = {
  email?: string; // filtro por email
  status?: string; // ex: ACTIVE, INACTIVE, PENDING
  limit?: number;
  offset?: number;
};

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { ok: false, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function resolveAsaasBaseUrl() {
  const fromEnv = (process.env.ASAAS_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const env = (process.env.ASAAS_ENV || "").toLowerCase().trim();
  if (env === "sandbox") return "https://api-sandbox.asaas.com";
  return "https://api.asaas.com";
}

export async function GET(req: Request) {
  try {
    const ASAAS_API_KEY = (process.env.ASAAS_API_KEY || "").trim();
    
    if (!ASAAS_API_KEY)
      return jsonError("ASAAS_API_KEY ausente no env", 500);

    // Parse query params
    const url = new URL(req.url);
    const email = url.searchParams.get("email") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    console.log("[ASAAS SUBS] Query:", { email, status, limit, offset });

    // 1) Buscar customer pelo email (se fornecido)
    let customerId: string | null = null;
    if (email) {
      const ASAAS_BASE_URL = resolveAsaasBaseUrl();
      
      const custResp = await fetch(
        `${ASAAS_BASE_URL}/v3/customers?email=${encodeURIComponent(email)}&limit=1`,
        {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "access_token": ASAAS_API_KEY,
          },
        }
      );

      const custJson = await custResp.json().catch(() => ({}));
      
      if (custResp.ok && custJson.data && custJson.data.length > 0) {
        customerId = custJson.data[0].id;
        console.log("[ASAAS SUBS] Found customer:", { email, customerId });
      } else {
        console.log("[ASAAS SUBS] No customer found for email:", email);
        return NextResponse.json({
          ok: true,
          data: [],
          total: 0,
          message: "Nenhum cliente encontrado com este email",
        });
      }
    }

    // 2) Buscar subscriptions
    const ASAAS_BASE_URL = resolveAsaasBaseUrl();
    
    let url_subs = `${ASAAS_BASE_URL}/v3/subscriptions?limit=${limit}&offset=${offset}`;
    
    if (customerId) {
      url_subs += `&customer=${customerId}`;
    }
    
    if (status) {
      url_subs += `&status=${encodeURIComponent(status)}`;
    }

    console.log("[ASAAS SUBS] Fetching from:", url_subs);

    const subsResp = await fetch(url_subs, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "access_token": ASAAS_API_KEY,
      },
    });

    const subsJson = await subsResp.json().catch(() => ({}));

    if (!subsResp.ok) {
      console.log("[ASAAS SUBS] fetch error:", {
        status: subsResp.status,
        body: subsJson,
      });
      return jsonError("Erro ao buscar assinaturas no Asaas", 502, { asaas: subsJson });
    }

    // 3) Formata resposta
    const subs = (subsJson.data || []).map((sub: any) => ({
      id: sub.id,
      customer_id: sub.customer,
      status: sub.status,
      billing_type: sub.billingType, // MONTHLY, QUARTERLY, SEMI_ANNUALLY, YEARLY
      cycle: sub.cycle, // MONTHLY, YEARLY, etc
      next_due_date: sub.nextDueDate,
      last_invoice_date: sub.lastInvoiceDate,
      created_at: sub.createdAt,
      value: sub.value,
      custom_fields: sub.customFields,
    }));

    console.log("[ASAAS SUBS] Returning:", { total: subsJson.totalCount, count: subs.length });

    return NextResponse.json({
      ok: true,
      data: subs,
      total: subsJson.totalCount || 0,
      limit,
      offset,
    });
  } catch (err: any) {
    console.log("[ASAAS SUBS] unexpected error:", err);
    return jsonError("Erro inesperado ao buscar assinaturas", 500, {
      message: String(err?.message || err),
    });
  }
}
