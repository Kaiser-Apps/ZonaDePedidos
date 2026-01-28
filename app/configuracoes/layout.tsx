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
  className = "",
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "px-3 py-3 rounded-xl text-sm font-semibold border transition whitespace-nowrap",
        "min-h-11 inline-flex items-center justify-center",
        active
          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
        className,
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

  // menu mobile
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeKey = useMemo(() => {
    if (pathname?.startsWith("/assinatura")) return "assinatura";
    if (pathname?.startsWith("/configuracoes")) return "config";
    return "pedidos";
  }, [pathname]);

  // fecha menu mobile ao trocar de rota
  useEffect(() => {
    setMobileOpen(false);
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

      const token = data.session.access_token;
      const res = await fetch("/api/billing/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        console.log("[CONFIG LAYOUT] billing/status error:", json);
        setTenantBilling(null);
        setLoading(false);
        return;
      }

      setTenantBilling((json?.tenantBilling as TenantBilling) || null);
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
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center gap-3">
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

            {/* DESKTOP ACTIONS */}
            <div className="hidden sm:flex items-center gap-2">
              {/* BADGE ASSINATURA */}
              <button
                onClick={() => router.push("/assinatura")}
                className={[
                  "text-xs font-semibold px-3 py-2 rounded-full border whitespace-nowrap",
                  "min-h-10",
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
                className="border px-3 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 whitespace-nowrap min-h-10"
              >
                Sair
              </button>
            </div>

            {/* MOBILE MENU BUTTON */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="sm:hidden border rounded-xl px-3 py-2 bg-white hover:bg-slate-50 min-h-11"
              aria-label="Abrir menu"
            >
              {/* ícone hambúrguer simples */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                className="text-slate-800"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 7H20M4 12H20M4 17H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* MOBILE DROPDOWN */}
          {mobileOpen && (
            <div className="sm:hidden mt-3 border rounded-2xl bg-white shadow-sm p-3">
              <div className="grid gap-2">
                <button
                  onClick={() => router.push("/assinatura")}
                  className={[
                    "text-sm font-semibold px-3 py-3 rounded-xl border",
                    "min-h-11 w-full text-left",
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
                  className="w-full justify-start"
                  onClick={() => setMobileOpen(false)}
                />

                <button
                  onClick={logout}
                  className="border px-3 py-3 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 w-full text-left min-h-11"
                >
                  Sair
                </button>
              </div>
            </div>
          )}
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
