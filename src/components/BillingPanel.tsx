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

export default function BillingPanel() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [tenant, setTenant] = useState<TenantBilling | null>(null);
  const [busy, setBusy] = useState(false);

  const [promo, setPromo] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  const mensalUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_ASAAS_LINK_MENSAL || "").trim(),
    []
  );
  const anualUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_ASAAS_LINK_ANUAL || "").trim(),
    []
  );

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

  const loadTenantBilling = async (tId: string) => {
    console.log("[BILLING] load tenant billing", tId);

    const { data, error } = await supabase
      .from("tenants")
      .select("id, subscription_status, trial_ends_at, current_period_end, plan")
      .eq("id", tId)
      .single();

    if (error) {
      console.log("[BILLING] load tenant error:", error);
      alert("Erro ao carregar assinatura: " + error.message);
      return;
    }

    setTenant((data as TenantBilling) || null);
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
        setLoading(false);
      }
    };

    init();

    return () => {
      alive = false;
    };
  }, []);

  const handleBack = () => {
    // Volta para a tela anterior se existir histórico; senão tenta /pedidos e,
    // se não existir, cai para /
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
    } catch (e) {
      console.log("[BILLING] handleBack history check error:", e);
    }

    // fallback robusto (evita 404 no localhost)
    (async () => {
      try {
        const res = await fetch("/pedidos", { method: "HEAD" });
        if (res.ok) {
          router.push("/pedidos");
        } else {
          router.push("/");
        }
      } catch (e) {
        console.log("[BILLING] handleBack HEAD /pedidos error:", e);
        router.push("/");
      }
    })();
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

  const openCheckoutFixed = async (plan: "MONTHLY" | "YEARLY") => {
    if (!tenantId) return;

    const url = plan === "MONTHLY" ? mensalUrl : anualUrl;

    if (!url) {
      alert(
        plan === "MONTHLY"
          ? "Link Mensal não configurado (NEXT_PUBLIC_ASAAS_LINK_MENSAL)."
          : "Link Anual não configurado (NEXT_PUBLIC_ASAAS_LINK_ANUAL)."
      );
      return;
    }

    setBusy(true);
    try {
      await ensureBillingEmail(plan);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
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
          <button
            className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-[44px]"
            onClick={handleBack}
          >
            ← Voltar
          </button>

          <button
            className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-[44px]"
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

      {/* PROMOCODE */}
      <div className="mt-6">
        <div className="text-sm font-bold">Cupom</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="Ex: PROMO7 ou CUPOMFAMILIA"
            className="border rounded-xl px-3 py-2 text-sm w-full sm:w-56 min-h-[44px]"
          />
          <button
            onClick={applyPromo}
            disabled={promoBusy}
            className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 min-h-[44px] w-full sm:w-auto"
          >
            {promoBusy ? "Aplicando..." : "Aplicar cupom"}
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          O cupom pode ativar <b>TRIAL</b> ou <b>VITALÍCIO</b> (família).
        </div>
      </div>

      {/* CHECKOUT */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          onClick={() => openCheckoutFixed("MONTHLY")}
          disabled={busy || isLifetime}
          className="bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 min-h-[44px] w-full"
          title={isLifetime ? "Assinatura vitalícia não precisa checkout" : ""}
        >
          {busy ? "Abrindo..." : isLifetime ? "Vitalícia ativa" : "Assinar Mensal"}
        </button>

        <button
          onClick={() => openCheckoutFixed("YEARLY")}
          disabled={busy || isLifetime}
          className="bg-slate-900 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 min-h-[44px] w-full"
          title={isLifetime ? "Assinatura vitalícia não precisa checkout" : ""}
        >
          {busy ? "Abrindo..." : isLifetime ? "Vitalícia ativa" : "Assinar Anual"}
        </button>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Após o pagamento, o webhook do Asaas atualiza o status automaticamente.
      </div>
    </div>
  );
}
