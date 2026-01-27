"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../src/lib/supabaseClient";

type AdminUserRow = {
  user_id: string;
  email: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  profile: null | {
    tenant_id: string;
    role: string | null;
    is_active: boolean;
    created_at: string | null;
  };
  tenant: null | {
    id: string;
    name: string;
    subscription_status: string | null;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plan: string | null;
  };
  flags: {
    pending_email: boolean;
    has_profile: boolean;
    has_tenant: boolean;
  };
};

function fmtDateBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function fmtDateTimeBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function trialValid(trialEndsAt: string | null) {
  if (!trialEndsAt) return false;
  const d = new Date(trialEndsAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() <= d.getTime();
}

function subscriptionLabel(row: AdminUserRow) {
  const t = row.tenant;
  const status = String(t?.subscription_status || "INACTIVE").toUpperCase();
  const isActive = status === "ACTIVE";
  const isLifetime = isActive && !t?.current_period_end;
  const isTrial = status === "TRIAL" && trialValid(t?.trial_ends_at || null);

  if (isLifetime) return "VITALÍCIA";
  if (isActive) return "ATIVA";
  if (isTrial) return "TRIAL";
  return status || "INACTIVE";
}

function badgeClass(kind: "ok" | "warn" | "bad" | "muted") {
  if (kind === "ok") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (kind === "warn") return "bg-amber-50 text-amber-800 border-amber-200";
  if (kind === "bad") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function AdminUsuariosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Sessão inválida.");
    return data.session.access_token;
  };

  const load = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();

      const res = await fetch("/api/admin/users", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => ({} as any));

      if (res.status === 403) {
        alert(json?.message || "Acesso negado: apenas Super Admin.");
        router.replace("/pedidos");
        return;
      }

      if (!res.ok) {
        alert(json?.message || "Falha ao carregar usuários");
        return;
      }

      setRows((json?.rows || []) as AdminUserRow[]);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;

    return rows.filter((r) => {
      const email = (r.email || "").toLowerCase();
      const tenant = (r.tenant?.name || "").toLowerCase();
      const role = (r.profile?.role || "").toLowerCase();
      return email.includes(qq) || tenant.includes(qq) || role.includes(qq);
    });
  }, [rows, q]);

  const toggleActive = async (r: AdminUserRow, nextActive: boolean) => {
    setBusyId(r.user_id);
    try {
      const token = await getAccessToken();

      const res = await fetch("/api/admin/users/toggle-active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: r.user_id, is_active: nextActive }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        alert(json?.message || "Falha ao atualizar usuário");
        return;
      }

      await load();
    } finally {
      setBusyId(null);
    }
  };

  const deleteByEmail = async (email: string) => {
    const e = String(email || "").trim().toLowerCase();
    if (!e) return;

    const ok = confirm(
      `ATENÇÃO: isso vai deletar TUDO do usuário e do tenant (pedidos, clientes, profiles, empresa e o Auth).\n\nConfirmar exclusão de: ${e}?`
    );
    if (!ok) return;

    setBusyId(e);
    try {
      const token = await getAccessToken();

      const res = await fetch("/api/admin/delete-user-by-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: e }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        console.log("[ADMIN] delete error:", json);
        const msg =
          json?.message ||
          json?.error ||
          json?.extra?.message ||
          json?.extra?.details ||
          "Falha ao deletar usuário";
        alert(msg);
        return;
      }


      alert("Usuário deletado com sucesso ✅");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleBack = () => {
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {}
    router.push("/pedidos");
  };

  return (
    <div className="min-h-screen bg-[#F3F7F4] p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white border rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xl font-extrabold">Admin Global • Usuários</div>
              <div className="text-sm text-slate-600">
                Super Admin: lista TODOS os usuários/tenants, bloqueia acesso e apaga tudo.
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
                onClick={load}
              >
                Atualizar
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por email, empresa ou role…"
              className="border rounded-xl px-3 py-2 text-sm w-full min-h-[44px]"
            />
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Total: <b>{filtered.length}</b> usuários
          </div>
        </div>

        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 text-slate-600">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-slate-600">Nenhum usuário encontrado.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="border-b px-4 py-3">Usuário</th>
                    <th className="border-b px-4 py-3">Empresa</th>
                    <th className="border-b px-4 py-3">Assinatura</th>
                    <th className="border-b px-4 py-3">Login</th>
                    <th className="border-b px-4 py-3">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((r) => {
                    const pending = r.flags.pending_email;
                    const hasProfile = r.flags.has_profile;
                    const active = r.profile?.is_active ?? false;

                    const sub = subscriptionLabel(r);
                    const subKind =
                      sub === "ATIVA" || sub === "VITALÍCIA"
                        ? "ok"
                        : sub === "TRIAL"
                        ? "warn"
                        : "muted";

                    const loginKind = pending ? "warn" : "ok";
                    const accessKind = active ? "ok" : "bad";

                    const busy = busyId === r.user_id || busyId === r.email;

                    return (
                      <tr key={r.user_id} className="hover:bg-slate-50">
                        <td className="border-b px-4 py-3">
                          <div className="font-semibold break-all">{r.email}</div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={[
                                "text-xs px-2 py-1 rounded-full border",
                                badgeClass(loginKind),
                              ].join(" ")}
                            >
                              {pending ? "PENDENTE (email)" : "CONFIRMADO"}
                            </span>

                            <span
                              className={[
                                "text-xs px-2 py-1 rounded-full border",
                                badgeClass(accessKind),
                              ].join(" ")}
                            >
                              {active ? "ATIVO (app)" : "BLOQUEADO (app)"}
                            </span>

                            <span className="text-xs px-2 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-200">
                              role: {String(r.profile?.role || "—")}
                            </span>

                            {!hasProfile ? (
                              <span className="text-xs px-2 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                                SEM PROFILE
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="border-b px-4 py-3">
                          <div className="font-semibold">{r.tenant?.name || "—"}</div>
                          <div className="text-xs text-slate-500">
                            plano: {r.tenant?.plan || "—"}
                          </div>
                        </td>

                        <td className="border-b px-4 py-3">
                          <span
                            className={[
                              "text-xs px-2 py-1 rounded-full border inline-flex",
                              badgeClass(subKind as any),
                            ].join(" ")}
                          >
                            {sub}
                          </span>
                          <div className="text-xs text-slate-500 mt-2">
                            trial: {fmtDateBR(r.tenant?.trial_ends_at || null)}
                          </div>
                          <div className="text-xs text-slate-500">
                            venc.:{" "}
                            {r.tenant?.current_period_end
                              ? fmtDateBR(r.tenant.current_period_end)
                              : "—"}
                          </div>
                        </td>

                        <td className="border-b px-4 py-3">
                          <div className="text-xs text-slate-600">último login:</div>
                          <div className="font-semibold">{fmtDateTimeBR(r.last_sign_in_at)}</div>
                          <div className="text-xs text-slate-500 mt-2">
                            criou: {fmtDateBR(r.profile?.created_at || null)}
                          </div>
                        </td>

                        <td className="border-b px-4 py-3">
                          <div className="flex flex-col gap-2 min-w-[180px]">
                            {hasProfile ? (
                              active ? (
                                <button
                                  disabled={busy}
                                  onClick={() => toggleActive(r, false)}
                                  className="border px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 min-h-[44px] disabled:opacity-60"
                                >
                                  {busy ? "..." : "Bloquear acesso"}
                                </button>
                              ) : (
                                <button
                                  disabled={busy}
                                  onClick={() => toggleActive(r, true)}
                                  className="border px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 min-h-[44px] disabled:opacity-60"
                                >
                                  {busy ? "..." : "Ativar acesso"}
                                </button>
                              )
                            ) : null}

                            <button
                              disabled={busy}
                              onClick={() => deleteByEmail(r.email)}
                              className="bg-rose-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-90 min-h-[44px] disabled:opacity-60"
                              title="Deleta tenant + pedidos + clients + profiles + usuário do Auth"
                            >
                              {busy ? "Deletando..." : "Deletar tudo"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500 px-1">
          * “PENDENTE” = email não confirmado no Auth. “BLOQUEADO” = profiles.is_active = false.
        </div>
      </div>
    </div>
  );
}
