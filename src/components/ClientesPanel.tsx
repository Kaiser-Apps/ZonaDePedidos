"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type TenantCtx = {
  tenantId: string;
  userId: string;
};

type ClientRow = {
  id: string;
  telefone: string;
  nome: string;
  endereco: string | null;
  cpf: string | null;
  cnpj: string | null;
  ie: string | null;
  created_at: string;
};

type ClientOrdersCountRow = {
  client_id: string | null;
  status: string | null;
  count: number | string | null;
};

type OrderMiniRow = {
  client_id: string | null;
  status: string | null;
  cliente_telefone: string | null;
  dt_entrada?: string | null;
  created_at?: string | null;
};

type LastOrderAggRow = {
  client_id: string | null;
  last_dt: string | number | null;
  last_created: string | number | null;
};

type LastOrderPhoneAggRow = {
  cliente_telefone: string | null;
  last_dt: string | number | null;
  last_created: string | number | null;
};

const ORDER_STATUSES = [
  "aberto",
  "orçamento",
  "aguardando retirada",
  "a receber",
  "pago",
  "arquivado",
] as const;

function statusBadgeClass(status: (typeof ORDER_STATUSES)[number]) {
  switch (status) {
    case "aberto":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "orçamento":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "aguardando retirada":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "a receber":
      return "bg-yellow-50 text-yellow-800 border-yellow-200";
    case "pago":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "arquivado":
      return "bg-gray-50 text-gray-700 border-gray-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

type ClientForm = {
  id?: string;
  telefone: string;
  nome: string;
  endereco: string;
  cpf: string;
  cnpj: string;
  ie: string;
};

const emptyForm: ClientForm = {
  telefone: "",
  nome: "",
  endereco: "",
  cpf: "",
  cnpj: "",
  ie: "",
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function normalizeForm(form: ClientForm): ClientForm {
  return {
    ...form,
    telefone: form.telefone.trim(),
    nome: form.nome.trim(),
    endereco: form.endereco.trim(),
    cpf: form.cpf.trim(),
    cnpj: form.cnpj.trim(),
    ie: form.ie.trim(),
  };
}

/**
 * Máscara Telefone BR:
 * - 10 dígitos: (11) 9999-8888
 * - 11 dígitos: (11) 99999-8888
 */
function maskPhone(value: string) {
  const v = onlyDigits(value).slice(0, 11);

  // 10 dígitos
  if (v.length <= 10) {
    return v.replace(
      /(\d{2})(\d{0,4})(\d{0,4})/,
      (_, ddd, p1, p2) =>
        `${ddd ? "(" + ddd + ")" : ""}${p1 ? " " + p1 : ""}${p2 ? "-" + p2 : ""}`
    );
  }

  // 11 dígitos
  return v.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2$3-$4");
}

function maskCPF(value: string) {
  const v = onlyDigits(value).slice(0, 11);

  return v.replace(
    /(\d{3})(\d{3})(\d{3})(\d{0,2})/,
    (_, a, b, c, d) =>
      `${a}${b ? "." + b : ""}${c ? "." + c : ""}${d ? "-" + d : ""}`
  );
}

function maskCNPJ(value: string) {
  const v = onlyDigits(value).slice(0, 14);

  return v.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/,
    (_, a, b, c, d, e) =>
      `${a}${b ? "." + b : ""}${c ? "." + c : ""}${d ? "/" + d : ""}${e ? "-" + e : ""}`
  );
}

function supabaseDuplicateMessage(err: any) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("uq_clients_tenant_tel"))
    return "Telefone já cadastrado para esta empresa.";
  if (msg.includes("uq_clients_tenant_cpf"))
    return "CPF já cadastrado para esta empresa.";
  if (msg.includes("uq_clients_tenant_cnpj"))
    return "CNPJ já cadastrado para esta empresa.";
  if (err?.code === "23505") return "Já existe um cliente com esses dados.";
  return null;
}

export default function ClientesPanel() {
  const router = useRouter();
  const [ctx, setCtx] = useState<TenantCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | (typeof ORDER_STATUSES)[number]>(
    ""
  );
  const [loadingList, setLoadingList] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);

  const [lastOrderByClient, setLastOrderByClient] = useState<
    Record<string, { dt: string | null; created: string | null }>
  >({});

  const [ordersCountsLoading, setOrdersCountsLoading] = useState(false);
  const [ordersCountsByClient, setOrdersCountsByClient] = useState<
    Record<string, Record<string, number>>
  >({});

  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  const sortedRows = useMemo(() => {
    const toTime = (v: string | null | undefined) => {
      if (!v) return 0;
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : 0;
    };

    const lastKey = (clientId: string) => {
      const m = lastOrderByClient?.[clientId];
      if (!m) return 0;
      // dt_entrada is YYYY-MM-DD; treat as UTC midnight to compare.
      const dt = m.dt ? `${m.dt}T00:00:00.000Z` : null;
      return Math.max(toTime(dt), toTime(m.created));
    };

    const copy = [...rows];
    copy.sort((a, b) => {
      const ta = lastKey(a.id);
      const tb = lastKey(b.id);
      if (ta !== tb) return tb - ta;

      // fallback: keep recent clients first
      const ca = toTime(a.created_at);
      const cb = toTime(b.created_at);
      if (ca !== cb) return cb - ca;

      return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
    });

    return copy;
  }, [rows, lastOrderByClient]);

  const visibleRows = useMemo(() => {
    if (!statusFilter) return sortedRows;
    if (ordersCountsLoading) return sortedRows;
    return sortedRows.filter(
      (r) => (ordersCountsByClient?.[r.id]?.[statusFilter] ?? 0) > 0
    );
  }, [sortedRows, statusFilter, ordersCountsByClient, ordersCountsLoading]);

  const loadOrdersMiniByClientId = async (clientIds: string[]) => {
    if (!ctx) return [] as OrderMiniRow[];

    const chunkSize = 40;
    const pageSize = 1000;
    const all: OrderMiniRow[] = [];

    for (let i = 0; i < clientIds.length; i += chunkSize) {
      const chunk = clientIds.slice(i, i + chunkSize);
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("orders")
          .select("client_id, status, cliente_telefone, dt_entrada, created_at")
          .eq("tenant_id", ctx.tenantId)
          .in("client_id", chunk)
          .range(from, from + pageSize - 1);

        if (error) {
          console.log("load orders mini (by client_id) error:", error);
          break;
        }

        const batch = (data || []) as OrderMiniRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
    }

    return all;
  };

  const loadOrdersMiniByPhoneWhenNoClientId = async (phones: string[]) => {
    if (!ctx) return [] as OrderMiniRow[];

    const cleanPhones = phones.map((p) => onlyDigits(p || "")).filter(Boolean);
    if (cleanPhones.length === 0) return [] as OrderMiniRow[];

    const chunkSize = 60;
    const pageSize = 1000;
    const all: OrderMiniRow[] = [];

    for (let i = 0; i < cleanPhones.length; i += chunkSize) {
      const chunk = cleanPhones.slice(i, i + chunkSize);
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("orders")
          .select("client_id, status, cliente_telefone, dt_entrada, created_at")
          .eq("tenant_id", ctx.tenantId)
          .is("client_id", null)
          .in("cliente_telefone", chunk)
          .range(from, from + pageSize - 1);

        if (error) {
          console.log("load orders mini (by phone) error:", error);
          break;
        }

        const batch = (data || []) as OrderMiniRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
    }

    return all;
  };

  const loadLastOrdersForClients = async (nextRows: ClientRow[]) => {
    if (!ctx) return;

    const clientIds = nextRows.map((r) => r.id);
    if (clientIds.length === 0) {
      setLastOrderByClient({});
      return;
    }

    const phoneToClientId: Record<string, string> = {};
    for (const r of nextRows) {
      const tel = onlyDigits(r.telefone || "");
      if (tel) phoneToClientId[tel] = r.id;
    }
    const phones = Object.keys(phoneToClientId);

    try {
      const baseMap: Record<string, { dt: string | null; created: string | null }> = {};

      const { data: byId, error: errById } = await supabase
        .from("orders")
        .select("client_id, last_dt:dt_entrada.max(), last_created:created_at.max()")
        .eq("tenant_id", ctx.tenantId)
        .in("client_id", clientIds);

      if (!errById) {
        for (const r of ((byId || []) as LastOrderAggRow[])) {
          if (!r.client_id) continue;
          const dt = r.last_dt != null ? String(r.last_dt) : null;
          const created = r.last_created != null ? String(r.last_created) : null;
          baseMap[String(r.client_id)] = {
            dt,
            created,
          };
        }
      }

      const { data: byPhone, error: errByPhone } = await supabase
        .from("orders")
        .select("cliente_telefone, last_dt:dt_entrada.max(), last_created:created_at.max()")
        .eq("tenant_id", ctx.tenantId)
        .is("client_id", null)
        .in("cliente_telefone", phones);

      if (!errByPhone) {
        for (const r of ((byPhone || []) as LastOrderPhoneAggRow[])) {
          const tel = onlyDigits(String(r.cliente_telefone || ""));
          const cid = tel ? phoneToClientId[tel] : "";
          if (!cid) continue;

          const existing = baseMap[cid] || { dt: null, created: null };
          const dt = r.last_dt != null ? String(r.last_dt) : null;
          const created = r.last_created != null ? String(r.last_created) : null;
          // keep the most recent values
          baseMap[cid] = {
            dt: dt || existing.dt,
            created: created || existing.created,
          };
        }
      }

      // If both aggregates came empty (or errored), fallback by scanning minimal rows
      const emptyAgg = Object.keys(baseMap).length === 0 && (errById || errByPhone);
      if (emptyAgg) {
        const ordersById = await loadOrdersMiniByClientId(clientIds);
        const ordersByPhone = await loadOrdersMiniByPhoneWhenNoClientId(phones);

        const toTime = (v: string | null | undefined) => {
          if (!v) return 0;
          const t = Date.parse(v);
          return Number.isFinite(t) ? t : 0;
        };

        const setIfNewer = (cid: string, dt: string | null, created: string | null) => {
          const cur = baseMap[cid] || { dt: null, created: null };
          const curKey = Math.max(
            toTime(cur.dt ? `${cur.dt}T00:00:00.000Z` : null),
            toTime(cur.created)
          );
          const nextKey = Math.max(
            toTime(dt ? `${dt}T00:00:00.000Z` : null),
            toTime(created)
          );
          if (nextKey > curKey) baseMap[cid] = { dt, created };
        };

        for (const o of ordersById) {
          if (!o.client_id) continue;
          setIfNewer(String(o.client_id), o.dt_entrada ?? null, o.created_at ?? null);
        }

        for (const o of ordersByPhone) {
          const tel = onlyDigits(String(o.cliente_telefone || ""));
          const cid = tel ? phoneToClientId[tel] : "";
          if (!cid) continue;
          setIfNewer(cid, o.dt_entrada ?? null, o.created_at ?? null);
        }
      }

      setLastOrderByClient(baseMap);
    } catch (e) {
      console.log("load last orders error:", e);
      setLastOrderByClient({});
    }
  };

  const loadOrdersCountsForClients = async (clientIds: string[]) => {
    if (!ctx) return;

    if (clientIds.length === 0) {
      setOrdersCountsByClient({});
      return;
    }

    setOrdersCountsLoading(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        // PostgREST aggregate: alias:column.aggregate()
        // groups by the non-aggregated columns (client_id, status)
        .select("client_id, status, count:id.count()")
        .eq("tenant_id", ctx.tenantId)
        .in("client_id", clientIds);

      const hasAggRows = Array.isArray(data) && data.length > 0;

      if (!error && hasAggRows) {
        const map: Record<string, Record<string, number>> = {};
        const list = (data || []) as ClientOrdersCountRow[];

        for (const r of list) {
          if (!r.client_id || !r.status) continue;
          const st = String(r.status);
          if (!ORDER_STATUSES.includes(st as (typeof ORDER_STATUSES)[number])) continue;
          const nRaw = r.count;
          const n = typeof nRaw === "number" ? nRaw : Number(nRaw || 0);
          if (!map[r.client_id]) map[r.client_id] = {};
          map[r.client_id][st] = Number.isFinite(n) ? n : 0;
        }

        setOrdersCountsByClient(map);
        return;
      }

      if (error) {
        console.log("load orders counts (aggregate) error:", error);
      }

      // Fallback robusto:
      // 1) conta por client_id (mesmo se aggregate falhar)
      // 2) se existirem pedidos antigos sem client_id, conta por telefone
      const ordersById = await loadOrdersMiniByClientId(clientIds);

      // Mapeia telefone -> clientId para associar pedidos sem client_id
      const phoneToClientId: Record<string, string> = {};
      for (const r of rows) {
        const tel = onlyDigits(r.telefone || "");
        if (tel) phoneToClientId[tel] = r.id;
      }

      const phones = Object.keys(phoneToClientId);
      const ordersByPhone = await loadOrdersMiniByPhoneWhenNoClientId(phones);

      const map: Record<string, Record<string, number>> = {};

      const inc = (clientId: string, status: string) => {
        if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) return;
        if (!map[clientId]) map[clientId] = {};
        map[clientId][status] = (map[clientId][status] || 0) + 1;
      };

      for (const o of ordersById) {
        if (!o.client_id || !o.status) continue;
        inc(String(o.client_id), String(o.status));
      }

      for (const o of ordersByPhone) {
        const tel = onlyDigits(o.cliente_telefone || "");
        const cid = tel ? phoneToClientId[tel] : "";
        if (!cid || !o.status) continue;
        inc(cid, String(o.status));
      }

      setOrdersCountsByClient(map);
    } finally {
      setOrdersCountsLoading(false);
    }
  };

  // 1) Descobre user + tenant_id (via profiles)
  useEffect(() => {
    let alive = true;

    const loadCtx = async () => {
      setCtxLoading(true);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
        }
        return;
      }

      const userId = userData.user.id;

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();

      if (profErr || !prof?.tenant_id) {
        console.log("profiles error:", profErr);
        alert(
          "Seu usuário não está vinculado a uma empresa (tenant). Confira a tabela profiles."
        );
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
        }
        return;
      }

      if (alive) {
        setCtx({ tenantId: prof.tenant_id, userId });
        setCtxLoading(false);
      }
    };

    loadCtx();

    return () => {
      alive = false;
    };
  }, []);

  // 2) Carrega lista (com busca)
  const loadClients = async () => {
    if (!ctx) return;

    setLoadingList(true);

    const query = supabase
      .from("clients")
      .select("id, telefone, nome, endereco, cpf, cnpj, ie, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    const qq = q.trim();
    const finalQuery =
      qq.length > 0
        ? query.or(
            [
              `nome.ilike.%${qq}%`,
              `telefone.ilike.%${qq}%`,
              `cpf.ilike.%${qq}%`,
              `cnpj.ilike.%${qq}%`,
            ].join(",")
          )
        : query;

    const { data, error } = await finalQuery;

    setLoadingList(false);

    if (error) {
      console.log("load clients error:", error);
      alert("Erro ao carregar clientes: " + error.message);
      return;
    }

    const nextRows = (data || []) as ClientRow[];
    setRows(nextRows);
    loadOrdersCountsForClients(nextRows.map((r) => r.id));
    loadLastOrdersForClients(nextRows);
  };

  useEffect(() => {
    if (!ctx) return;
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const resetForm = () => setForm(emptyForm);

  const openNewClient = () => {
    resetForm();
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeForm = () => {
    resetForm();
    setFormOpen(false);
  };

  const pickRow = (r: ClientRow) => {
    // OBS: no banco agora vamos salvar só números; então ao editar, a máscara vai reaplicar.
    setForm({
      id: r.id,
      telefone: maskPhone(r.telefone || ""),
      nome: r.nome || "",
      endereco: r.endereco || "",
      cpf: maskCPF(r.cpf || ""),
      cnpj: maskCNPJ(r.cnpj || ""),
      ie: r.ie || "",
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!ctx) return;

    const nf = normalizeForm(form);

    if (!nf.nome) return alert("Preencha o nome.");
    if (!nf.telefone) return alert("Preencha o telefone.");

    // ✅ salva só números no banco (melhor pra busca/duplicidade)
    const telefoneNorm = onlyDigits(nf.telefone);
    const cpfNorm = onlyDigits(nf.cpf);
    const cnpjNorm = onlyDigits(nf.cnpj);

    // ✅ espelha a regra de CPF: não permitir telefone repetido por tenant
    // (mantém UX boa mesmo se o índice único ainda não estiver aplicado no banco)
    {
      const dupQuery = supabase
        .from("clients")
        .select("id")
        .eq("tenant_id", ctx.tenantId)
        .eq("telefone", telefoneNorm)
        .limit(1);

      const { data: dupRows, error: dupErr } = isEdit && form.id
        ? await dupQuery.neq("id", form.id)
        : await dupQuery;

      if (dupErr) {
        console.log("dup telefone check error:", dupErr);
      } else if ((dupRows || []).length > 0) {
        return alert("Telefone já cadastrado para esta empresa.");
      }
    }

    setSaving(true);

    const payload = {
      tenant_id: ctx.tenantId,
      telefone: telefoneNorm,
      nome: nf.nome,
      endereco: nf.endereco || null,
      cpf: cpfNorm || null,
      cnpj: cnpjNorm || null,
      ie: nf.ie || null,
      updated_by: ctx.userId,
    };

    try {
      if (isEdit && form.id) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", form.id);

        if (error) {
          const friendly = supabaseDuplicateMessage(error);
          if (friendly) return alert(friendly);
          console.log("update error:", error);
          return alert("Erro ao atualizar: " + error.message);
        }

        alert("Cliente atualizado!");
      } else {
        const { error } = await supabase.from("clients").insert([
          {
            ...payload,
            created_by: ctx.userId,
          },
        ]);

        if (error) {
          const friendly = supabaseDuplicateMessage(error);
          if (friendly) return alert(friendly);
          console.log("insert error:", error);
          return alert("Erro ao salvar: " + error.message);
        }

        alert("Cliente cadastrado!");
      }

      resetForm();
      setFormOpen(false);
      await loadClients();
    } finally {
      setSaving(false);
    }
  };

  if (ctxLoading) {
    return (
      <div className="border rounded p-4">
        <div className="font-semibold">Clientes</div>
        <div className="text-gray-600 mt-2">Carregando contexto...</div>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="border rounded p-4">
        <div className="font-semibold">Clientes</div>
        <div className="text-red-600 mt-2">
          Não foi possível carregar seu tenant. Verifique se existe um registro na
          tabela <b>profiles</b> para seu usuário.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER / ACTIONS */}
      <div className="border rounded p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-semibold">Clientes</div>
            <div className="text-sm text-gray-600"></div>
          </div>

          <div className="flex gap-2">
            <button onClick={openNewClient} className="bg-black text-white px-3 py-2 rounded">
              Novo cliente
            </button>
            {formOpen && (
              <button
                onClick={closeForm}
                className="border px-3 py-2 rounded"
                disabled={saving}
              >
                Fechar ficha
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FORM (FICHA) */}
      {formOpen && (
        <div className="border rounded p-4">
          <div className="font-bold text-lg">
            {isEdit ? "Editar Cliente" : "Cadastrar Cliente"}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <Field
              label="Telefone *"
              value={form.telefone}
              onChange={(v) => setForm((s) => ({ ...s, telefone: maskPhone(v) }))}
              placeholder="(11) 99999-9999"
            />
            <Field
              label="Nome *"
              value={form.nome}
              onChange={(v) => setForm((s) => ({ ...s, nome: v }))}
              placeholder="Nome do cliente"
            />
            <Field
              label="Endereço"
              value={form.endereco}
              onChange={(v) => setForm((s) => ({ ...s, endereco: v }))}
              placeholder="Rua, número, bairro..."
            />
            <Field
              label="CPF"
              value={form.cpf}
              onChange={(v) => setForm((s) => ({ ...s, cpf: maskCPF(v) }))}
              placeholder="000.000.000-00"
            />
            <Field
              label="CNPJ"
              value={form.cnpj}
              onChange={(v) => setForm((s) => ({ ...s, cnpj: maskCNPJ(v) }))}
              placeholder="00.000.000/0000-00"
            />
            <Field
              label="IE"
              value={form.ie}
              onChange={(v) => setForm((s) => ({ ...s, ie: v }))}
              placeholder="Inscrição estadual"
            />
          </div>

          {/* BOTÕES (ABAIXO, LADO ESQUERDO) */}
          <div className="flex gap-2 mt-4 justify-start">
            <button
              onClick={save}
              className="bg-black text-white px-3 py-2 rounded"
              disabled={saving}
            >
              {saving ? "Salvando..." : isEdit ? "Atualizar" : "Salvar"}
            </button>

            <button
              onClick={closeForm}
              className="border px-3 py-2 rounded"
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* LIST + SEARCH */}
      <div className="border rounded p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div>
            <div className="font-bold text-lg">Lista de Clientes</div>
            <div className="text-sm text-gray-600"></div>
          </div>

          <div className="flex gap-2">
            <input
              className="border rounded px-3 py-2 w-full md:w-96"
              placeholder="Buscar por nome, telefone, CPF ou CNPJ..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadClients();
              }}
            />

            <select
              className="border rounded px-3 py-2"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  (e.target.value || "") as "" | (typeof ORDER_STATUSES)[number]
                )
              }
              title="Filtrar clientes por status de pedido"
              disabled={ordersCountsLoading}
            >
              <option value="">Todos</option>
              {ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <button
              onClick={loadClients}
              className="border px-3 py-2 rounded"
              disabled={loadingList}
            >
              {loadingList ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border px-3 py-2">Nome</th>
                <th className="border px-3 py-2">Telefone</th>
                <th className="border px-3 py-2">CPF</th>
                <th className="border px-3 py-2">CNPJ</th>
                <th className="border px-2 py-2 w-48">Pedidos</th>
                <th className="border px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="border px-3 py-3 text-gray-600" colSpan={6}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td
                      className="border px-3 py-2 cursor-pointer"
                      onClick={() => pickRow(r)}
                    >
                      {r.nome}
                    </td>

                    {/* ✅ mostra formatado */}
                    <td className="border px-3 py-2">{maskPhone(r.telefone)}</td>
                    <td className="border px-3 py-2">
                      {r.cpf ? maskCPF(r.cpf) : ""}
                    </td>
                    <td className="border px-3 py-2">
                      {r.cnpj ? maskCNPJ(r.cnpj) : ""}
                    </td>

                    <td className="border px-2 py-2 text-xs text-gray-700 w-48">
                      {ordersCountsLoading ? (
                        <span className="text-gray-500">Carregando...</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const badges = ORDER_STATUSES.map((st) => {
                              const n = ordersCountsByClient?.[r.id]?.[st] ?? 0;
                              if (!n) return null;

                              return (
                                <span
                                  key={st}
                                  className={
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                                    statusBadgeClass(st)
                                  }
                                  title={`${st}: ${n}`}
                                >
                                  <span className="capitalize">{st}</span>
                                  <span className="tabular-nums">{n}</span>
                                </span>
                              );
                            }).filter(Boolean);

                            if (badges.length === 0) {
                              return (
                                <span className="text-gray-400 text-[11px]">
                                  sem registro de pedidos
                                </span>
                              );
                            }

                            return badges;
                          })()}
                        </div>
                      )}
                    </td>

                    <td className="border px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          className="border px-2 py-1 rounded"
                          onClick={() => pickRow(r)}
                        >
                          Editar
                        </button>

                        <button
                          className="border px-2 py-1 rounded"
                          type="button"
                          onClick={() => router.push(`/clientes/${r.id}/historico`)}
                        >
                          Ver histórico
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="text-xs text-gray-500 mt-3">
            Mostrando até 200 registros (ordenado por criação).
          </div>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{props.label}</div>
      <input
        className="border rounded px-3 py-2 w-full"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </label>
  );
}
