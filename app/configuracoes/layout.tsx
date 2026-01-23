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
        "px-3 py-2 rounded-xl text-sm font-semibold border transition whitespace-nowrap",
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
  return !Number.isNaN(d.getTime()) && Date.now() <= d.getTime();
}

function isAccessAllowed(t: TenantBilling | null) {
  const st = (t?.subscription_status || "INACTIVE").toUpperCase();
  if (st === "ACTIVE") return true;
  if (st === "TRIAL") return isTrialValid(t?.trial_ends_at || null);
  return false;
}

/* =====================
   LAYOUT
===================== */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [tenantBilling, setTenantBilling] =
    useState<TenantBilling | null>(null);

  const activeKey = useMemo(() => {
    if (pathname?.startsWith("/assinatura")) return "assinatura";
    if (pathname?.startsWith("/configuracoes")) return "config";
    return "pedidos";
  }, [pathname]);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();

      if (!profile?.tenant_id) return;

      const { data: tenant } = await supabase
        .from("tenants")
        .select(
          "id, subscription_status, trial_ends_at, current_period_end, plan"
        )
        .eq("id", profile.tenant_id)
        .single();

      setTenantBilling((tenant as TenantBilling) || null);
      setLoading(false);
    };

    run();
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando…
      </div>
    );
  }

  const st = (tenantBilling?.subscription_status || "INACTIVE").toUpperCase();
  const badge =
    st === "ACTIVE"
      ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Ativa" }
      : st === "TRIAL"
      ? { cls: "bg-sky-50 text-sky-700 border-sky-200", text: "Trial" }
      : { cls: "bg-amber-50 text-amber-800 border-amber-200", text: "Inativa" };

  return (
    <div className="min-h-screen bg-[#F3F7F4] text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          {/* BRAND */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-extrabold">
              Z
            </div>
            <div className="min-w-0">
              <div className="font-extrabold truncate">Zona de Pedidos</div>
              <div className="text-xs text-slate-500 truncate">
                Painel de gestão
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* ACTIONS — tudo na MESMA LINHA */}
          <div className="flex items-center gap-2 flex-nowrap">
            {/* BADGE ASSINATURA */}
            <button
              onClick={() => router.push("/assinatura")}
              className={[
                "text-xs font-semibold px-3 py-2 rounded-full border whitespace-nowrap",
                "hover:opacity-90 hover:shadow-sm",
                badge.cls,
              ].join(" ")}
              title="Ir para Assinatura"
            >
              Assinatura: {badge.text}
            </button>

            <NavItem
              href="/configuracoes"
              label="Configurações"
              active={activeKey === "config"}
            />

            <button
              onClick={logout}
              className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 whitespace-nowrap"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="bg-white border rounded-2xl shadow-sm p-4 md:p-6">
          {children}
        </div>

        <footer className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Zona de Pedidos
        </footer>
      </main>
    </div>
  );
}
