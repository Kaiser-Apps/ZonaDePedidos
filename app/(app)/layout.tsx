"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";

/* =====================
   NAV ITEM
===================== */
function NavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "px-3 py-2 rounded-xl text-sm font-semibold border transition",
        active
          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

type TenantBilling = {
  id: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: string | null;
};

function isTrialValid(trialEndsAt: string | null) {
  if (!trialEndsAt) return false;
  const d = new Date(trialEndsAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() <= d.getTime();
}

function isAccessAllowed(t: TenantBilling | null) {
  const st = (t?.subscription_status || "INACTIVE").toUpperCase();
  if (st === "ACTIVE") return true;
  if (st === "TRIAL") return isTrialValid(t?.trial_ends_at || null);
  return false;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(true);

  const [tenantBilling, setTenantBilling] = useState<TenantBilling | null>(null);

  const isBillingPage = useMemo(() => pathname?.startsWith("/assinatura"), [pathname]);

  const activeKey = useMemo(() => {
    if (pathname?.startsWith("/assinatura")) return "assinatura";
    if (pathname?.startsWith("/configuracoes")) return "config";
    if (pathname?.startsWith("/clientes")) return "clientes";
    return "pedidos";
  }, [pathname]);

  /* =====================
     AUTH + LOAD BILLING
  ===================== */
  useEffect(() => {
    let alive = true;

    const run = async () => {
      console.log("[LAYOUT] Checking session...");
      setLoading(true);
      setBillingLoading(true);

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        console.log("[LAYOUT] getUser error:", userErr);
        router.replace("/login");
        return;
      }

      const userId = userData.user.id;

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();

      if (profileErr || !profile?.tenant_id) {
        console.log("[LAYOUT] profile error:", profileErr);
        alert("Usuário sem tenant vinculado. Verifique a tabela profiles.");
        if (alive) {
          setTenantBilling(null);
          setLoading(false);
          setBillingLoading(false);
        }
        return;
      }

      const tenantId = String(profile.tenant_id);

      const { data: t, error: tErr } = await supabase
        .from("tenants")
        .select("id, subscription_status, trial_ends_at, current_period_end, plan")
        .eq("id", tenantId)
        .single();

      if (tErr) {
        console.log("[LAYOUT] load tenant billing error:", tErr);
      }

      if (alive) {
        setTenantBilling((t as TenantBilling) || null);
        setLoading(false);
        setBillingLoading(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [router]);

  /* =====================
     ACCESS GATE
  ===================== */
  useEffect(() => {
    if (loading || billingLoading) return;

    // libera sempre a própria página de assinatura
    if (isBillingPage) return;

    // (Opcional) deixa configurações livre mesmo sem pagar
    if (pathname?.startsWith("/configuracoes")) return;

    const ok = isAccessAllowed(tenantBilling);
    if (!ok) {
      console.log("[LAYOUT] Access blocked -> redirect /assinatura", tenantBilling);
      router.replace("/assinatura");
    }
  }, [loading, billingLoading, isBillingPage, pathname, router, tenantBilling]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F7F4] flex items-center justify-center">
        <div className="bg-white border rounded-2xl px-6 py-4 shadow-sm">
          Carregando...
        </div>
      </div>
    );
  }

  const st = (tenantBilling?.subscription_status || "INACTIVE").toUpperCase();
  const badge =
    st === "ACTIVE"
      ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Ativa" }
      : st === "TRIAL" && isTrialValid(tenantBilling?.trial_ends_at || null)
      ? { cls: "bg-sky-50 text-sky-700 border-sky-200", text: "Trial" }
      : { cls: "bg-amber-50 text-amber-800 border-amber-200", text: "Inativa" };

  return (
    <div className="min-h-screen bg-[#F3F7F4] text-slate-900">
      {/* TOPBAR */}
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center">
          {/* BRAND (LEFT) */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-green-500 flex items-center justify-center shadow-sm">
              <span className="text-white font-extrabold">Z</span>
            </div>

            <div>
              <div className="font-extrabold">Zona de Pedidos</div>
              <div className="text-xs text-slate-500">Painel de gestão</div>
            </div>
          </div>

          <div className="flex-1" />

          {/* BADGE */}
          <div className="hidden md:flex items-center mr-3">
            <div className={["text-xs font-semibold px-3 py-1 rounded-full border", badge.cls].join(" ")}>
              Assinatura: {badge.text}
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex items-center gap-2">
            <NavItem href="/assinatura" label="Assinatura" active={activeKey === "assinatura"} />
            <NavItem href="/configuracoes" label="Configurações" active={activeKey === "config"} />

            <button
              onClick={logout}
              className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="bg-white border rounded-2xl shadow-sm p-4 md:p-6">{children}</div>

        <footer className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Zona de Pedidos
        </footer>
      </main>
    </div>
  );
}
