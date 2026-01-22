"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [tenant, setTenant] = useState<TenantBilling | null>(null);
  const [busy, setBusy] = useState(false);

  const [promo, setPromo] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  const status = useMemo(
    () => (tenant?.subscription_status || "INACTIVE").toUpperCase(),
    [tenant]
  );

  const isActive = useMemo(() => status === "ACTIVE", [status]);
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

  const openCheckout = async () => {
    if (!tenantId) return;
    setBusy(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/asaas/create-recurring-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId }),
      });

      const json = await res.json();

      if (!res.ok) {
        console.log("[BILLING] create link error:", json);
        alert(json?.error || "Erro ao iniciar assinatura.");
        return;
      }

      if (!json?.url) {
        alert("Asaas não retornou URL do checkout.");
        return;
      }

      window.location.href = json.url;
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, promocode: code }),
      });

      const json = await res.json();

      if (!res.ok) {
        console.log("[BILLING] apply promo error:", json);
        alert(json?.error || "Cupom inválido.");
        return;
      }

      alert(`Cupom aplicado! Trial até: ${fmtDateBR(json?.trial_ends_at || null)}`);
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

        <button
          className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50"
          onClick={() => tenantId && loadTenantBilling(tenantId)}
        >
          Atualizar status
        </button>
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
            <div className="font-semibold">{fmtDateBR(tenant?.current_period_end || null)}</div>
          </div>
        </div>

        {isActive ? (
          <div className="mt-3 text-sm text-emerald-700 font-semibold">Assinatura ativa ✅</div>
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
        <div className="text-sm font-bold">Cupom de Trial</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="Ex: PROMO7"
            className="border rounded-xl px-3 py-2 text-sm w-56"
          />
          <button
            onClick={applyPromo}
            disabled={promoBusy}
            className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50"
          >
            {promoBusy ? "Aplicando..." : "Aplicar cupom"}
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          O cupom ativa o status <b>TRIAL</b> até a data calculada.
        </div>
      </div>

      {/* CHECKOUT */}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={openCheckout}
          disabled={busy}
          className="bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold"
        >
          {busy ? "Abrindo..." : "Assinar agora (Asaas)"}
        </button>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Após o pagamento, o webhook do Asaas atualiza o status automaticamente.
      </div>
    </div>
  );
}
