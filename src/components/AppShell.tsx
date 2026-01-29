"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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

  past_due_since?: string | null;
  grace_days?: number | null;
};

function isTrialValid(trialEndsAt: string | null) {
  if (!trialEndsAt) return false;
  const d = new Date(trialEndsAt);
  return !Number.isNaN(d.getTime()) && Date.now() <= d.getTime();
}

function isWithinGrace(pastDueSince: string | null | undefined, graceDays: number) {
  if (!pastDueSince) return false;
  const start = new Date(pastDueSince).getTime();
  if (Number.isNaN(start)) return false;
  const ms = graceDays * 24 * 60 * 60 * 1000;
  return Date.now() <= start + ms;
}

function isAccessAllowed(t: TenantBilling | null) {
  const st = (t?.subscription_status || "INACTIVE").toUpperCase();

  if (st === "ACTIVE") return true;

  if (st === "TRIAL") return isTrialValid(t?.trial_ends_at || null);

  if (st === "PAST_DUE") {
    const grace =
      typeof t?.grace_days === "number" && t.grace_days >= 0 ? t.grace_days : 3;
    return isWithinGrace(t?.past_due_since || null, grace);
  }

  return false;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [tenantBilling, setTenantBilling] = useState<TenantBilling | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeKey = useMemo(() => {
    if (pathname?.startsWith("/assinatura")) return "assinatura";
    if (pathname?.startsWith("/configuracoes")) return "config";
    return "pedidos";
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const run = async () => {
      try {
        const { data: sessionData, error: sessErr } =
          await supabase.auth.getSession();

        if (sessErr) {
          console.log("[APP SHELL] getSession error:", sessErr);
          router.replace("/login");
          return;
        }

        if (!sessionData.session) {
          router.replace("/login");
          return;
        }

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
          console.log("[APP SHELL] getUser error:", userErr);
          router.replace("/login");
          return;
        }

        const userId = userData?.user?.id;
        if (!userId) {
          router.replace("/login");
          return;
        }

        setUserEmail(userData?.user?.email || null);

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("tenant_id, role")
          .eq("user_id", userId)
          .maybeSingle();

        if (profErr) {
          console.log("[APP SHELL] profiles error:", profErr);
          router.replace("/login");
          return;
        }

        if (!profile?.tenant_id) {
          console.log("[APP SHELL] no profile/tenant_id for user:", userId);
          router.replace("/login");
          return;
        }

        const role = String(profile?.role || "").toLowerCase();
        setIsAdmin(role === "admin");

        const token = sessionData.session.access_token;
        const res = await fetch("/api/billing/status", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        type BillingStatusResponse = { tenantBilling?: TenantBilling | null };
        let json: BillingStatusResponse = {};
        try {
          json = (await res.json()) as BillingStatusResponse;
        } catch {
          json = {};
        }
        if (!res.ok) {
          console.log("[APP SHELL] billing/status error:", json);
          setTenantBilling(null);
          return;
        }

        const t = json?.tenantBilling ?? null;
        setTenantBilling(t);

        if (!pathname?.startsWith("/assinatura")) {
          const allowed = isAccessAllowed(t);
          if (!allowed) {
            router.replace("/assinatura");
            return;
          }
        }
      } catch (e) {
        console.log("[APP SHELL] unexpected:", e);
        router.replace("/login");
        return;
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [router, pathname]);

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
  const canGoToPedidos = isAccessAllowed(tenantBilling);
  const badge =
    st === "ACTIVE"
      ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Ativa" }
      : st === "TRIAL"
      ? { cls: "bg-sky-50 text-sky-700 border-sky-200", text: "Trial" }
      : st === "PAST_DUE"
      ? { cls: "bg-amber-50 text-amber-800 border-amber-200", text: "Em atraso" }
      : { cls: "bg-amber-50 text-amber-800 border-amber-200", text: "Inativa" };

  return (
    <div className="min-h-screen bg-[#F3F7F4] text-slate-900">
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (!canGoToPedidos) return;
                  router.push("/?novo=1");
                }}
                disabled={!canGoToPedidos}
                className={[
                  "h-10 w-10 rounded-2xl bg-emerald-600 flex items-center justify-center",
                  "text-white font-extrabold",
                  canGoToPedidos
                    ? "cursor-pointer hover:opacity-90"
                    : "cursor-default opacity-80",
                ].join(" ")}
                aria-label={canGoToPedidos ? "Ir para pedidos" : "Assinatura inativa"}
                title={canGoToPedidos ? "Ir para pedidos" : "Assinatura inativa"}
              >
                Z
              </button>

              <div className="min-w-0">
                <div className="font-extrabold truncate">Zona de Pedidos</div>
                <div className="text-xs text-slate-500 truncate">Painel de gestão</div>
              </div>
            </div>

            <div className="flex-1" />

            {userEmail && (
              <div
                className="hidden md:block text-xs text-slate-600 truncate max-w-60"
                title={userEmail}
              >
                {userEmail}
              </div>
            )}

            {isAdmin && (
              <button
                onClick={() => router.push("/admin/usuarios")}
                className={[
                  "hidden sm:inline-flex items-center justify-center",
                  "min-h-10 px-3 py-2 rounded-xl",
                  "border border-slate-200 bg-white hover:bg-slate-50",
                  "text-sm font-semibold whitespace-nowrap",
                ].join(" ")}
                title="Gerenciar usuários"
              >
                Admin
              </button>
            )}

            <div className="hidden sm:flex items-center gap-2">
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

            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="sm:hidden border rounded-xl px-3 py-2 bg-white hover:bg-slate-50 min-h-11"
              aria-label="Abrir menu"
            >
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

          {mobileOpen && (
            <div className="sm:hidden mt-3 border rounded-2xl bg-white shadow-sm p-3">
              <div className="grid gap-2">
                {userEmail && (
                  <div className="px-3 py-2 text-xs text-slate-600 truncate" title={userEmail}>
                    {userEmail}
                  </div>
                )}

                {isAdmin && (
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      router.push("/admin/usuarios");
                    }}
                    className="border px-3 py-3 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 w-full text-left min-h-11"
                    title="Gerenciar usuários"
                  >
                    Admin
                  </button>
                )}

                <button
                  onClick={() => {
                    setMobileOpen(false);
                    router.push("/assinatura");
                  }}
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
