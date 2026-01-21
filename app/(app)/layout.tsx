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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);

  const activeKey = useMemo(() => {
    if (pathname?.startsWith("/configuracoes")) return "config";
    if (pathname?.startsWith("/clientes")) return "clientes";
    return "pedidos";
  }, [pathname]);

  /* =====================
     AUTH GUARD
  ===================== */
  useEffect(() => {
    let alive = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      if (alive) setLoading(false);
    };

    checkSession();

    return () => {
      alive = false;
    };
  }, [router]);

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
              <div className="text-xs text-slate-500">
                Painel de gestão
              </div>
            </div>
          </div>

          {/* SPACER */}
          <div className="flex-1" />

          {/* RIGHT ACTIONS (COLADOS NO CANTO DIREITO) */}
          <div className="flex items-center gap-2">
            <NavItem
              href="/configuracoes"
              label="Configurações"
              active={activeKey === "config"}
            />

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
