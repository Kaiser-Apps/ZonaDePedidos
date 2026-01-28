"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/navigation";

type TenantBilling = {
  id: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: string | null;
  cnpj: string | null;
};

type BillingSummary = {
  received_count: number;
  received_gross: number;
  received_net: number;
  last_payment_date: string | null;
};

function fmtDateBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function trialValid(trialEndsAt: string | null) {
  if (!trialEndsAt) return false;
  const d = new Date(trialEndsAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() <= d.getTime();
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function maskCPF(digits: string) {
  const d = onlyDigits(digits).slice(0, 11);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 9);
  const e = d.slice(9, 11);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `${a}.${b}`;
  if (d.length <= 9) return `${a}.${b}.${c}`;
  return `${a}.${b}.${c}-${e}`;
}

function maskCNPJ(digits: string) {
  const d = onlyDigits(digits).slice(0, 14);
  const a = d.slice(0, 2);
  const b = d.slice(2, 5);
  const c = d.slice(5, 8);
  const e = d.slice(8, 12);
  const f = d.slice(12, 14);
  if (d.length <= 2) return a;
  if (d.length <= 5) return `${a}.${b}`;
  if (d.length <= 8) return `${a}.${b}.${c}`;
  if (d.length <= 12) return `${a}.${b}.${c}/${e}`;
  return `${a}.${b}.${c}/${e}-${f}`;
}

function maskCpfCnpj(value: string) {
  const d = onlyDigits(value);
  if (d.length <= 11) return maskCPF(d);
  return maskCNPJ(d);
}

export default function BillingPanel() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [tenant, setTenant] = useState<TenantBilling | null>(null);
  const [busy, setBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);

  const [promo, setPromo] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  const [cpfCnpj, setCpfCnpj] = useState("");
  const [billingType, setBillingType] = useState<
    "UNDEFINED" | "CREDIT_CARD" | "PIX" | "BOLETO"
  >("UNDEFINED");
  const planMonthlyName = useMemo(
    () => (process.env.NEXT_PUBLIC_PLAN_MONTHLY_NAME || "Plano Mensal").trim(),
    []
  );
  const planYearlyName = useMemo(
    () => (process.env.NEXT_PUBLIC_PLAN_YEARLY_NAME || "Plano Anual").trim(),
    []
  );
  const planMonthlyValue = useMemo(
    () => (process.env.NEXT_PUBLIC_PLAN_MONTHLY_VALUE || "5.90").trim(),
    []
  );
  const planYearlyValue = useMemo(
    () => (process.env.NEXT_PUBLIC_PLAN_YEARLY_VALUE || "499.00").trim(),
    []
  );


  const [summary, setSummary] = useState<BillingSummary | null>(null);

  // ✅ aparece "Começar" somente quando ativou AGORA (cupom/pagamento)
  const [justActivated, setJustActivated] = useState(false);

  const status = useMemo(
    () => (tenant?.subscription_status || "INACTIVE").toUpperCase(),
    [tenant]
  );

  const isActive = useMemo(() => status === "ACTIVE", [status]);

  // ✅ Vitalícia: ACTIVE e sem vencimento
  const isLifetime = useMemo(() => {
    return isActive && !tenant?.current_period_end;
  }, [isActive, tenant]);

  const isTrial = useMemo(
    () => status === "TRIAL" && trialValid(tenant?.trial_ends_at || null),
    [status, tenant]
  );

  const currentPlanCycle = useMemo(() => {
    const p = String(tenant?.plan || "").toUpperCase();
    if (p === "YEARLY") return "YEARLY" as const;
    if (p === "MONTHLY") return "MONTHLY" as const;
    return "MONTHLY" as const;
  }, [tenant]);

  const isInactive = useMemo(() => status === "INACTIVE", [status]);

  // ✅ "novo" = INACTIVE e sem datas
  const isBrandNew = useMemo(() => {
    return isInactive && !tenant?.trial_ends_at && !tenant?.current_period_end;
  }, [isInactive, tenant]);

  // ✅ regra de botões (conforme você pediu):
  // - Tenant novo (INACTIVE e sem datas): não aparece nada.
  // - Tenant já teve algo (trial, ativo, vencimento etc): aparece ← Voltar (como hoje)
  // - Tenant após aplicar cupom ou ativar o plano AGORA: aparece Começar → e leva pra HOME (pedidos)
  const showStart = useMemo(() => {
    return justActivated;
  }, [justActivated]);

  const showBack = useMemo(() => {
    return !isBrandNew && !justActivated;
  }, [isBrandNew, justActivated]);

  const handleStart = () => {
    // ✅ seu "pedidos" hoje está na HOME (app/page.tsx)
    router.push("/");
  };

  const loadTenantBilling = async (tId: string) => {
    console.log("[BILLING] load tenant billing", tId);

    try {
      const token = await getAccessToken();
      const res = await fetch("/api/billing/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        console.log("[BILLING] billing/status error:", json);
        alert(json?.message || "Erro ao carregar assinatura.");
        return;
      }

      const next = (json?.tenantBilling as TenantBilling) || null;
      setTenant(next);
      if (next?.cnpj) {
        setCpfCnpj(maskCpfCnpj(String(next.cnpj)));
      }
    } catch (e: any) {
      console.log("[BILLING] billing/status exception:", e);
      alert("Erro ao carregar assinatura.");
      return;
    }
  };

  const loadSummary = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/billing/summary", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        // tabela pode ainda não existir; não quebra a tela
        setSummary(null);
        return;
      }
      setSummary(json?.totals || null);
    } catch {
      setSummary(null);
    }
  };

  const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Sessão inválida.");
    return data.session.access_token;
  };

  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoading(true);

      const { data: userData, error: uErr } = await supabase.auth.getUser();
      if (uErr || !userData.user) {
        console.log("[BILLING] getUser error:", uErr);
        if (alive) setLoading(false);
        return;
      }

      const userId = userData.user.id;

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();

      if (pErr || !profile?.tenant_id) {
        console.log("[BILLING] profile error:", pErr);
        alert("Usuário sem tenant vinculado.");
        if (alive) setLoading(false);
        return;
      }

      const tId = String(profile.tenant_id);

      if (alive) {
        setTenantId(tId);
        await loadTenantBilling(tId);
        await loadSummary();
        setLoading(false);
      }
    };

    init();

    return () => {
      alive = false;
    };
  }, []);

  const handleBack = () => {
    // Volta para a tela anterior se existir histórico; senão cai para HOME
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
    } catch (e) {
      console.log("[BILLING] handleBack history check error:", e);
    }

    router.push("/");
  };

  const ensureBillingEmail = async (plan: "MONTHLY" | "YEARLY") => {
    const token = await getAccessToken();

    const res = await fetch("/api/tenant/ensure-billing-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan }),
    });

    const json = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      console.log("[BILLING] ensure billing_email error:", json);
      const msg =
        json?.message || json?.error || "Erro ao preparar checkout (billing_email).";
      alert(msg);
      throw new Error(msg);
    }

    return json;
  };

  const startSubscription = async (plan: "MONTHLY" | "YEARLY") => {
    if (!tenantId) return;

    setBusy(true);
    try {
      const token = await getAccessToken();

      // ✅ garante billing_email antes do checkout
      await ensureBillingEmail(plan);

      const digits = onlyDigits(cpfCnpj);
      if (!(digits.length === 11 || digits.length === 14)) {
        alert("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) para cobrança.");
        return;
      }

      const apiRes = await fetch("/api/asaas/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: plan === "YEARLY" ? "yearly" : "monthly",
          cpfCnpj: digits,
          billingType,
        }),
      });

      const apiJson = await apiRes.json().catch(() => ({} as any));

      if (!apiRes.ok) {
        console.log("[BILLING] create-subscription error:", apiJson);
        const msg = apiJson?.message || "Erro ao criar assinatura.";
        if (
          apiJson?.extra?.code === "MISSING_CPF_CNPJ" ||
          apiJson?.extra?.code === "MISSING_CPF_CNPJ_ON_ASAAS"
        ) {
          alert(msg);
          return;
        }

        alert(msg);
        return;
      }

      console.log("[BILLING] create-subscription success:", apiJson);

      const invoiceUrl = apiJson?.redirectUrl || null;
      if (invoiceUrl) {
        // ✅ redireciona no mesmo tab (fluxo profissional)
        window.location.href = String(invoiceUrl);
        return;
      }

      // fallback raro: assinatura criada, mas o payment ainda não apareceu
      alert(
        "Assinatura criada, mas o checkout ainda está sendo gerado. Clique em 'Atualizar status' em alguns segundos."
      );
    } finally {
      setBusy(false);
    }
  };

  const changePlan = async (cycle: "MONTHLY" | "YEARLY") => {
    if (!tenantId) return;

    setPlanBusy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/asaas/change-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cycle }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        alert(json?.message || "Erro ao trocar plano.");
        return;
      }

      alert("Plano atualizado com sucesso! ✅");
      await loadTenantBilling(tenantId);
    } finally {
      setPlanBusy(false);
    }
  };

  const applyPromo = async () => {
    if (!tenantId) return;

    const code = promo.trim().toUpperCase();
    if (!code) {
      alert("Digite um cupom.");
      return;
    }

    setPromoBusy(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/promocode/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantId, promocode: code }),
      });

      const json = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        console.log("[BILLING] apply promo error:", json);
        alert(json?.error || json?.message || "Cupom inválido.");
        return;
      }

      if (json?.type === "LIFETIME") {
        alert("Cupom vitalício aplicado! ✅");
      } else {
        alert(`Cupom aplicado! Trial até: ${fmtDateBR(json?.trial_ends_at || null)}`);
      }

      await loadTenantBilling(tenantId);
      await loadSummary();

      // ✅ marcou ativação "AGORA" (para aparecer Começar)
      setJustActivated(true);

      setPromo("");
    } finally {
      setPromoBusy(false);
    }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="bg-white border rounded-2xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xl font-extrabold">Assinatura</div>
          <div className="text-sm text-slate-600">
            Ative sua assinatura para liberar o uso do sistema.
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {showStart ? (
            <button
              className="bg-black text-white px-3 py-2 rounded-xl text-sm font-semibold hover:opacity-90 min-h-11"
              onClick={handleStart}
              title="Ir para Pedidos"
            >
              Começar →
            </button>
          ) : showBack ? (
            <button
              className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-11"
              onClick={handleBack}
            >
              ← Voltar
            </button>
          ) : null}

          <button
            className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-11"
            onClick={() => tenantId && loadTenantBilling(tenantId)}
          >
            Atualizar status
          </button>
        </div>
      </div>

      <div className="mt-4 p-4 rounded-xl border bg-slate-50">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-xs text-slate-600">Status</div>
            <div className="font-semibold">{status}</div>
          </div>

          <div>
            <div className="text-xs text-slate-600">Plano</div>
            <div className="font-semibold">{tenant?.plan || "—"}</div>
          </div>

          <div>
            <div className="text-xs text-slate-600">Trial até</div>
            <div className="font-semibold">{fmtDateBR(tenant?.trial_ends_at || null)}</div>
          </div>

          <div>
            <div className="text-xs text-slate-600">Próximo vencimento</div>
            <div className="font-semibold">
              {isLifetime ? "Vitalícia" : fmtDateBR(tenant?.current_period_end || null)}
            </div>
          </div>
        </div>

        {isLifetime ? (
          <div className="mt-3 text-sm text-emerald-700 font-semibold">
            Assinatura vitalícia ✅
          </div>
        ) : isActive ? (
          <div className="mt-3 text-sm text-emerald-700 font-semibold">
            Assinatura ativa ✅
          </div>
        ) : isTrial ? (
          <div className="mt-3 text-sm text-sky-700 font-semibold">Trial ativo ✅</div>
        ) : (
          <div className="mt-3 text-sm text-amber-800">
            Assinatura inativa. Assine para liberar o acesso.
          </div>
        )}
      </div>

      {/* DASHBOARD */}
      {summary ? (
        <div className="mt-4 p-4 rounded-xl border bg-white">
          <div className="text-sm font-extrabold">Financeiro (no seu banco)</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-600">Pagamentos recebidos</div>
              <div className="font-semibold">{summary.received_count}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600">Último pagamento</div>
              <div className="font-semibold">{summary.last_payment_date || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600">Total bruto</div>
              <div className="font-semibold">R$ {Number(summary.received_gross || 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600">Total líquido</div>
              <div className="font-semibold">R$ {Number(summary.received_net || 0).toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Alimentado automaticamente pelo webhook (asaas_payments).
          </div>
        </div>
      ) : null}

      {/* PROMOCODE */}
      <div className="mt-6">
        <div className="text-sm font-bold">Cupom</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="Ex: PROMO7 ou CUPOMFAMILIA"
            className="border rounded-xl px-3 py-2 text-sm w-full sm:w-56 min-h-11"
          />
          <button
            onClick={applyPromo}
            disabled={promoBusy}
            className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-11 w-full sm:w-auto disabled:opacity-60"
          >
            {promoBusy ? "Aplicando..." : "Aplicar cupom"}
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          O cupom pode ativar <b>TRIAL</b> ou <b>VITALÍCIO</b> (família).
        </div>
      </div>

      {/* CHECKOUT */}
      <div className="mt-6">
        <div className="text-sm font-bold">CPF/CNPJ</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={cpfCnpj}
            onChange={(e) => setCpfCnpj(maskCpfCnpj(e.target.value))}
            inputMode="numeric"
            placeholder="Digite seu CPF ou CNPJ"
            className="border rounded-xl px-3 py-2 text-sm w-full sm:w-72 min-h-11"
          />
          <button
            type="button"
            onClick={() => router.push("/configuracoes")}
            className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-11 w-full sm:w-auto"
            title="Configurações (dados do tenant)"
          >
            Editar dados
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Usado para emissão da cobrança no Asaas. (Aceita CPF 11 dígitos ou CNPJ 14 dígitos)
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-bold">Forma de pagamento</div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setBillingType("UNDEFINED")}
            className={`border px-3 py-2 rounded-xl text-sm font-semibold min-h-11 w-full ${
              billingType === "UNDEFINED" ? "bg-black text-white" : "bg-white hover:bg-slate-50"
            }`}
            title="Deixa o checkout do Asaas oferecer as opções"
          >
            Escolher
          </button>
          <button
            type="button"
            onClick={() => setBillingType("CREDIT_CARD")}
            className={`border px-3 py-2 rounded-xl text-sm font-semibold min-h-11 w-full ${
              billingType === "CREDIT_CARD" ? "bg-black text-white" : "bg-white hover:bg-slate-50"
            }`}
          >
            Cartão
          </button>
          <button
            type="button"
            onClick={() => setBillingType("PIX")}
            className={`border px-3 py-2 rounded-xl text-sm font-semibold min-h-11 w-full ${
              billingType === "PIX" ? "bg-black text-white" : "bg-white hover:bg-slate-50"
            }`}
          >
            PIX
          </button>
          <button
            type="button"
            onClick={() => setBillingType("BOLETO")}
            className={`border px-3 py-2 rounded-xl text-sm font-semibold min-h-11 w-full ${
              billingType === "BOLETO" ? "bg-black text-white" : "bg-white hover:bg-slate-50"
            }`}
          >
            Boleto
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Dica: use <b>Escolher</b> para o checkout mostrar Cartão/PIX/Boleto no link.
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          onClick={() => startSubscription("MONTHLY")}
          disabled={busy || isLifetime}
          className="bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 min-h-11 w-full"
          title={isLifetime ? "Assinatura vitalícia não precisa checkout" : ""}
        >
          {busy
            ? "Processando..."
            : isLifetime
              ? "Vitalícia ativa"
              : `${planMonthlyName} (R$ ${planMonthlyValue})`}
        </button>

        <button
          onClick={() => startSubscription("YEARLY")}
          disabled={busy || isLifetime}
          className="bg-slate-900 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 min-h-11 w-full"
          title={isLifetime ? "Assinatura vitalícia não precisa checkout" : ""}
        >
          {busy
            ? "Processando..."
            : isLifetime
              ? "Vitalícia ativa"
              : `${planYearlyName} (R$ ${planYearlyValue})`}
        </button>
      </div>

      {/* TROCA DE PLANO */}
      {!isLifetime && (isActive || isTrial) ? (
        <div className="mt-4 p-4 rounded-xl border bg-white">
          <div className="text-sm font-extrabold">Trocar plano</div>
          <div className="mt-1 text-xs text-slate-600">
            Plano atual: <b>{currentPlanCycle}</b>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currentPlanCycle !== "MONTHLY" ? (
              <button
                disabled={planBusy}
                className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-11 disabled:opacity-60 w-full"
                onClick={() => changePlan("MONTHLY")}
              >
                {planBusy ? "Atualizando..." : "Trocar para Mensal"}
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            {currentPlanCycle !== "YEARLY" ? (
              <button
                disabled={planBusy}
                className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-11 disabled:opacity-60 w-full"
                onClick={() => changePlan("YEARLY")}
              >
                {planBusy ? "Atualizando..." : "Trocar para Anual"}
              </button>
            ) : null}
          </div>

          <div className="mt-2 text-xs text-slate-500">
            A mudança é aplicada na assinatura do Asaas e salva no seu banco.
          </div>
        </div>
      ) : null}

      <div className="mt-4 text-xs text-slate-500">
        Após o pagamento, o webhook do Asaas atualiza o status automaticamente.
      </div>
    </div>
  );
}
