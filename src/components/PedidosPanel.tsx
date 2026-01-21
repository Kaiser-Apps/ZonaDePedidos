"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Trash2, Eye, X, Printer, Share2 } from "lucide-react";

type TenantCtx = {
  tenantId: string;
  userId: string;
};

type TenantInfo = {
  id: string;
  name: string;
  cnpj: string | null;
  ie: string | null;
  endereco: string | null;
  phone: string | null;
};

type ClientMini = {
  id: string;
  nome: string;
  telefone: string;
};

type OrderRow = {
  id: string;
  created_at: string;

  dt_entrada: string;
  dt_saida: string | null;

  client_id: string | null;
  cliente_nome: string;
  cliente_telefone: string | null;

  item: string | null;
  descricao: string | null;
  valor: number;
  status: string;
};

type OrderForm = {
  id?: string;

  dt_entrada: string;
  dt_saida: string;

  client_id: string;
  cliente_nome: string;
  cliente_telefone: string;

  item: string;
  descricao: string;
  valor: string;
  status: string;
};

type PreviewItem = {
  n: number;
  desc: string;
  value: number;
};

const STATUSES = [
  "aberto",
  "orçamento",
  "aguardando retirada",
  "a receber",
  "pago",
  "arquivado",
] as const;

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function maskPhone(value: string) {
  const v = onlyDigits(value).slice(0, 11);

  if (v.length <= 10) {
    return v.replace(
      /(\d{2})(\d{0,4})(\d{0,4})/,
      (_, ddd, p1, p2) =>
        `${ddd ? "(" + ddd + ")" : ""}${p1 ? " " + p1 : ""}${p2 ? "-" + p2 : ""}`
    );
  }

  return v.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2$3-$4");
}

function formatBRLFromNumber(n: number) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n || 0);
  } catch {
    return `R$ ${(n || 0).toFixed(2)}`;
  }
}

function maskBRL(input: string) {
  const digits = onlyDigits(input);
  if (!digits) return "";

  const cents = parseInt(digits, 10);
  const value = cents / 100;

  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatted;
}

function parseBRLToNumber(brl: string) {
  const v = (brl || "").trim();
  if (!v) return 0;

  const normalized = v.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function calculateTotalFromDescription(desc: string): number {
  if (!desc) return 0;

  const lines = desc.split("\n");
  let total = 0;

  for (const line of lines) {
    const matches = line.match(/\d+[.,]?\d*/g);
    if (!matches || matches.length === 0) continue;

    const last = matches[matches.length - 1];
    const n = Number(last.replace(/\./g, "").replace(",", "."));
    if (!isNaN(n)) total += n;
  }

  return total;
}

function parseDescriptionToPreviewItems(desc: string | null): PreviewItem[] {
  if (!desc) return [];

  const lines = desc
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let n = 1;
  const items: PreviewItem[] = [];

  for (const line of lines) {
    const cleaned = line.replace(/^\s*\d+\s*[\)\.\-]?\s*/g, "").trim();

    const matches = cleaned.match(/\d+[.,]?\d*/g);
    if (!matches || matches.length === 0) {
      items.push({ n, desc: cleaned || "—", value: 0 });
      n++;
      continue;
    }

    const last = matches[matches.length - 1];
    const value = Number(last.replace(/\./g, "").replace(",", "."));
    const idx = cleaned.lastIndexOf(last);

    const descText = (idx >= 0 ? cleaned.slice(0, idx) : cleaned)
      .replace(/[-–—]\s*$/g, "")
      .replace(/\s+$/g, "")
      .trim();

    items.push({
      n,
      desc: descText || "—",
      value: Number.isFinite(value) ? value : 0,
    });

    n++;
  }

  return items;
}

function buildShareText(order: OrderRow, tenant: TenantInfo | null) {
  const itens = parseDescriptionToPreviewItems(order.descricao);
  const total = itens.reduce((acc, it) => acc + (it.value || 0), 0);
  const totalFinal = total > 0 ? total : Number(order.valor) || 0;

  const lines = [
    tenant?.name ? `Empresa: ${tenant.name}` : "",
    tenant?.cnpj ? `CNPJ: ${tenant.cnpj}` : "",
    tenant?.ie ? `IE: ${tenant.ie}` : "",
    tenant?.endereco ? `Endereço: ${tenant.endereco}` : "",
    tenant?.phone ? `Fone: ${maskPhone(tenant.phone)}` : "",
    "",
    `Pedido (${order.status})`,
    `Data: ${order.dt_entrada}`,
    `Cliente: ${order.cliente_nome}`,
    order.cliente_telefone ? `Fone cliente: ${maskPhone(order.cliente_telefone)}` : "",
    order.item ? `Item: ${order.item}` : "",
    "",
    "Itens:",
    ...itens.map((it) => `- ${it.n}) ${it.desc} — ${formatBRLFromNumber(it.value)}`),
    "",
    `TOTAL: ${formatBRLFromNumber(totalFinal)}`,
  ].filter(Boolean);

  return lines.join("\n");
}

function escapeHtml(str: string) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openPrintWindow(order: OrderRow, tenant: TenantInfo | null) {
  const itens = parseDescriptionToPreviewItems(order.descricao);
  const total = itens.reduce((acc, it) => acc + (it.value || 0), 0);
  const totalFinal = total > 0 ? total : Number(order.valor) || 0;

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Pedido</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    .box { border: 2px solid #111; padding: 16px; border-radius: 8px; }
    .muted { color: #111; font-size: 12px; }
    .hr { border-top: 2px solid #111; margin: 10px 0; }
    table { width:100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 2px solid #111; padding: 8px; font-size: 12px; }
    th { text-align:left; background: #f5f5f5; }
    .right { text-align:right; }
    .total { font-weight: 800; font-size: 16px; text-align:right; margin-top: 10px;}
  </style>
</head>
<body>
  <div class="box">
    <div class="muted">
      <div><b>${tenant?.name || ""}</b></div>
      <div>${tenant?.cnpj ? `<b>CNPJ:</b> ${tenant.cnpj}` : ""} ${tenant?.ie ? `&nbsp;&nbsp;<b>IE:</b> ${tenant.ie}` : ""}</div>
      <div>${tenant?.endereco ? `<b>Endereço:</b> ${tenant.endereco}` : ""}</div>
      <div>${tenant?.phone ? `<b>Fone:</b> ${maskPhone(tenant.phone)}` : ""}</div>
    </div>

    <div class="hr"></div>

    <div class="muted" style="display:flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <div><b>Data:</b> ${order.dt_entrada}</div>
      <div><b>Status:</b> ${order.status}</div>
      <div><b>Cliente:</b> ${escapeHtml(order.cliente_nome)}</div>
      <div><b>Fone:</b> ${order.cliente_telefone ? maskPhone(order.cliente_telefone) : ""}</div>
    </div>

    <div class="hr"></div>

    <div style="text-align:center; font-weight:700; margin: 6px 0;">
      ${escapeHtml(order.item || "")}
    </div>

    <div class="hr"></div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">Item</th>
          <th>Descrição</th>
          <th class="right" style="width:140px;">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${
          itens.length === 0
            ? `<tr><td>1</td><td>—</td><td class="right">${formatBRLFromNumber(totalFinal)}</td></tr>`
            : itens
                .map(
                  (it) => `
          <tr>
            <td>${it.n}</td>
            <td>${escapeHtml(it.desc)}</td>
            <td class="right">${formatBRLFromNumber(it.value)}</td>
          </tr>`
                )
                .join("")
        }
      </tbody>
    </table>

    <div class="total">TOTAL: ${formatBRLFromNumber(totalFinal)}</div>
  </div>

  <script>
    window.onload = () => {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return alert("Pop-up bloqueado. Permita pop-ups para imprimir.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

const emptyForm = (): OrderForm => ({
  dt_entrada: todayISO(),
  dt_saida: "",

  client_id: "",
  cliente_nome: "",
  cliente_telefone: "",

  item: "",
  descricao: "",
  valor: "",
  status: "aberto",
});

export default function PedidosPanel() {
  const [ctx, setCtx] = useState<TenantCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<(typeof STATUSES)[number]>("aberto");

  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrderForm>(emptyForm());
  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<OrderRow | null>(null);

  const [clientQ, setClientQ] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const [clientOptions, setClientOptions] = useState<ClientMini[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const debounceRef = useRef<any>(null);

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
        console.log("[PEDIDOS] profiles error:", profErr);
        alert("Seu usuário não está vinculado a uma empresa (tenant). Confira a tabela profiles.");
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

  // ✅ carrega dados do tenant (com diagnóstico)
  useEffect(() => {
    const loadTenant = async () => {
      if (!ctx?.tenantId) return;

      setTenantLoading(true);
      setTenantError(null);

      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, cnpj, ie, endereco, phone")
        .eq("id", ctx.tenantId)
        .maybeSingle(); // ✅ melhor que single para diagnosticar 0 linhas

      setTenantLoading(false);

      if (error) {
        console.log("[PEDIDOS] load tenant error:", error);
        setTenantInfo(null);
        setTenantError(error.message);
        return;
      }

      console.log("[PEDIDOS] tenant loaded:", data);

      if (!data) {
        setTenantInfo(null);
        setTenantError("Nenhum tenant retornado (provável RLS sem policy de SELECT).");
        return;
      }

      setTenantInfo(data as TenantInfo);
    };

    loadTenant();
  }, [ctx?.tenantId]);

  const loadOrders = async (status: string) => {
    if (!ctx) return;
    setOrdersLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select("id, created_at, dt_entrada, dt_saida, client_id, cliente_nome, cliente_telefone, item, descricao, valor, status")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", status)
      .order("dt_entrada", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);

    setOrdersLoading(false);

    if (error) {
      console.log("[PEDIDOS] load orders error:", error);
      alert("Erro ao carregar pedidos: " + error.message);
      return;
    }

    setOrders((data || []) as OrderRow[]);
  };

  useEffect(() => {
    if (!ctx) return;
    loadOrders(statusTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, statusTab]);

  const resetForm = () => {
    setForm(emptyForm());
    setClientQ("");
    setClientOptions([]);
    setShowClientDropdown(false);
  };

  const pickOrderToEdit = (o: OrderRow) => {
    const valorMasked = maskBRL(String(Math.round(Number(o.valor || 0) * 100)));

    setForm({
      id: o.id,
      dt_entrada: o.dt_entrada,
      dt_saida: o.dt_saida || "",
      client_id: o.client_id || "",
      cliente_nome: o.cliente_nome || "",
      cliente_telefone: o.cliente_telefone ? maskPhone(o.cliente_telefone) : "",
      item: o.item || "",
      descricao: o.descricao || "",
      valor: valorMasked,
      status: o.status,
    });

    setClientQ(o.cliente_nome || "");
    setShowClientDropdown(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openPreview = (o: OrderRow) => {
    setPreviewOrder(o);
    setPreviewOpen(true);
  };

  const removeOrder = async (o: OrderRow) => {
    if (!confirm(`Excluir o pedido de "${o.cliente_nome}"?`)) return;

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", o.id)
      .eq("tenant_id", ctx?.tenantId || "");

    if (error) {
      console.log("[PEDIDOS] delete order error:", error);
      alert("Erro ao excluir: " + error.message);
      return;
    }

    if (form.id === o.id) resetForm();
    await loadOrders(statusTab);
  };

  const searchClients = async (query: string) => {
    if (!ctx) return;

    const qq = query.trim();
    if (qq.length < 2) {
      setClientOptions([]);
      return;
    }

    setClientLoading(true);

    const digits = onlyDigits(qq);
    const ors = [`nome.ilike.%${qq}%`, `telefone.ilike.%${qq}%`];
    if (digits.length >= 2) ors.push(`telefone.ilike.%${digits}%`);

    const { data, error } = await supabase
      .from("clients")
      .select("id, nome, telefone")
      .eq("tenant_id", ctx.tenantId)
      .or(ors.join(","))
      .order("created_at", { ascending: false })
      .limit(10);

    setClientLoading(false);

    if (error) {
      console.log("[PEDIDOS] search clients error:", error);
      return;
    }

    setClientOptions((data || []) as ClientMini[]);
  };

  const onClientQChange = (v: string) => {
    setClientQ(v);
    setShowClientDropdown(true);

    setForm((s) => ({
      ...s,
      cliente_nome: v,
      client_id: s.client_id,
    }));

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchClients(v), 250);
  };

  const pickClient = (c: ClientMini) => {
    setForm((s) => ({
      ...s,
      client_id: c.id,
      cliente_nome: c.nome,
      cliente_telefone: maskPhone(c.telefone || ""),
    }));
    setClientQ(c.nome);
    setShowClientDropdown(false);
    setClientOptions([]);
  };

  const save = async () => {
    if (!ctx) return;

    const dt_entrada = (form.dt_entrada || "").trim();
    if (!dt_entrada) return alert("Preencha a data de entrada.");

    const cliente_nome = (form.cliente_nome || clientQ || "").trim();
    if (!cliente_nome) return alert("Selecione ou digite o cliente.");

    const valorN = parseBRLToNumber(form.valor);
    if (valorN <= 0) return alert("Preencha um valor maior que zero.");

    setSaving(true);

    const payload = {
      tenant_id: ctx.tenantId,
      dt_entrada,
      dt_saida: form.dt_saida ? form.dt_saida : null,
      client_id: form.client_id ? form.client_id : null,
      cliente_nome,
      cliente_telefone: form.cliente_telefone ? onlyDigits(form.cliente_telefone) : null,
      item: form.item ? form.item.trim() : null,
      descricao: form.descricao ? form.descricao.trim() : null,
      valor: valorN,
      status: form.status,
      updated_by: ctx.userId,
    };

    try {
      if (isEdit && form.id) {
        const { error } = await supabase
          .from("orders")
          .update(payload)
          .eq("id", form.id)
          .eq("tenant_id", ctx.tenantId);

        if (error) {
          console.log("[PEDIDOS] update order error:", error);
          alert("Erro ao atualizar: " + error.message);
          return;
        }

        alert("Pedido atualizado!");
      } else {
        const { error } = await supabase.from("orders").insert([
          {
            ...payload,
            created_by: ctx.userId,
          },
        ]);

        if (error) {
          console.log("[PEDIDOS] insert order error:", error);
          alert("Erro ao salvar: " + error.message);
          return;
        }

        alert("Pedido cadastrado!");
      }

      const savedStatus = form.status as any;
      resetForm();
      setStatusTab(savedStatus);
      await loadOrders(savedStatus);
    } finally {
      setSaving(false);
    }
  };

  if (ctxLoading) {
    return (
      <div className="border rounded p-4">
        <div className="font-semibold">Pedidos</div>
        <div className="text-gray-600 mt-2">Carregando contexto...</div>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="border rounded p-4">
        <div className="font-semibold">Pedidos</div>
        <div className="text-red-600 mt-2">
          Não foi possível carregar seu tenant. Verifique se existe um registro na tabela <b>profiles</b> para seu usuário.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* FORM */}
      <div className="border rounded p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-lg">{isEdit ? "Editar Pedido" : "Novo Pedido"}</div>
            <div className="text-sm text-gray-600">Status atual: {form.status}</div>
            {tenantError && (
              <div className="text-xs text-red-600 mt-1">
                Tenant não carregou: {tenantError}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {isEdit && (
              <button className="border px-3 py-2 rounded" onClick={resetForm} disabled={saving}>
                Cancelar edição
              </button>
            )}

            <button className="bg-black text-white px-3 py-2 rounded" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : isEdit ? "Atualizar" : "Salvar"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <Field
            label="Data de entrada *"
            type="date"
            value={form.dt_entrada}
            onChange={(v) => setForm((s) => ({ ...s, dt_entrada: v }))}
          />

          <Field
            label="Data de saída"
            type="date"
            value={form.dt_saida}
            onChange={(v) => setForm((s) => ({ ...s, dt_saida: v }))}
          />

          <label className="block">
            <div className="text-sm font-medium mb-1">Status *</div>
            <select
              className="border rounded px-3 py-2 w-full"
              value={form.status}
              onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2 relative">
            <div className="text-sm font-medium mb-1">Cliente *</div>
            <input
              className="border rounded px-3 py-2 w-full"
              placeholder="Digite nome ou telefone..."
              value={clientQ}
              onChange={(e) => onClientQChange(e.target.value)}
              onFocus={() => setShowClientDropdown(true)}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
            />

            {showClientDropdown && (clientLoading || clientOptions.length > 0) && (
              <div className="absolute z-10 mt-1 w-full border bg-white rounded shadow">
                {clientLoading ? (
                  <div className="p-3 text-sm text-gray-600">Buscando...</div>
                ) : clientOptions.length === 0 ? (
                  <div className="p-3 text-sm text-gray-600">Nenhum cliente encontrado.</div>
                ) : (
                  clientOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickClient(c)}
                    >
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-gray-600">{maskPhone(c.telefone || "")}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <Field
            label="Telefone do cliente"
            value={form.cliente_telefone}
            onChange={(v) => setForm((s) => ({ ...s, cliente_telefone: maskPhone(v) }))}
            placeholder="(11) 99999-9999"
          />

          <Field
            label="Item"
            value={form.item}
            onChange={(v) => setForm((s) => ({ ...s, item: v }))}
            placeholder="Ex: Produto / Serviço"
          />

          <Field
            label="Valor *"
            value={form.valor}
            onChange={(v) => setForm((s) => ({ ...s, valor: maskBRL(v) }))}
            placeholder="0,00"
          />

          <label className="block md:col-span-3">
            <div className="text-sm font-medium mb-1">Descrição (soma automática por linha)</div>
            <textarea
              className="border rounded px-3 py-2 w-full min-h-[110px]"
              value={form.descricao}
              onChange={(e) => {
                const desc = e.target.value;
                const total = calculateTotalFromDescription(desc);

                setForm((s) => ({
                  ...s,
                  descricao: desc,
                  valor: total > 0 ? maskBRL(String(Math.round(total * 100))) : s.valor,
                }));
              }}
              placeholder={`Ex:
1 AMORTECEDOR DIANTEIRO - 250
2 TERMINAL - 85
3 MAO DE OBRA - 1500`}
            />
          </label>
        </div>
      </div>

      {/* LISTA */}
      <div className="border rounded p-4">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={`px-3 py-2 rounded border ${statusTab === s ? "bg-black text-white" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-auto">
          {ordersLoading ? (
            <div className="text-gray-600">Carregando pedidos...</div>
          ) : (
            <table className="min-w-full border">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="border px-3 py-2">Entrada</th>
                  <th className="border px-3 py-2">Cliente</th>
                  <th className="border px-3 py-2">Item</th>
                  <th className="border px-3 py-2">Valor</th>
                  <th className="border px-3 py-2">Status</th>
                  <th className="border px-3 py-2">Ações</th>
                </tr>
              </thead>

              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border px-3 py-3 text-gray-600">
                      Nenhum pedido neste status.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="border px-3 py-2">{o.dt_entrada}</td>

                      <td className="border px-3 py-2">
                        <div className="font-medium">{o.cliente_nome}</div>
                        <div className="text-xs text-gray-600">
                          {o.cliente_telefone ? maskPhone(o.cliente_telefone) : ""}
                        </div>
                      </td>

                      <td className="border px-3 py-2">{o.item || ""}</td>

                      <td className="border px-3 py-2">{formatBRLFromNumber(Number(o.valor) || 0)}</td>

                      <td className="border px-3 py-2">{o.status}</td>

                      <td className="border px-3 py-2">
                        <div className="flex gap-2 items-center">
                          <button className="border px-2 py-1 rounded" onClick={() => pickOrderToEdit(o)}>
                            Editar
                          </button>

                          <button
                            className="border px-2 py-1 rounded inline-flex items-center gap-1"
                            onClick={() => openPreview(o)}
                            title="Visualizar"
                          >
                            <Eye size={16} />
                            Visualizar
                          </button>

                          <button
                            className="border px-2 py-1 rounded inline-flex items-center justify-center"
                            onClick={() => removeOrder(o)}
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL */}
      {previewOpen && previewOrder && (
        <PreviewModal
          tenant={tenantInfo}
          tenantLoading={tenantLoading}
          order={previewOrder}
          onClose={() => setPreviewOpen(false)}
          onPrint={() => openPrintWindow(previewOrder, tenantInfo)}
          onShare={async () => {
            const text = buildShareText(previewOrder, tenantInfo);
            await navigator.clipboard.writeText(text);
            alert("Texto copiado! Cole no WhatsApp.");
          }}
        />
      )}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{props.label}</div>
      <input
        className="border rounded px-3 py-2 w-full"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={props.type || "text"}
      />
    </label>
  );
}

function PreviewModal(props: {
  tenant: TenantInfo | null;
  tenantLoading: boolean;
  order: OrderRow;
  onClose: () => void;
  onPrint: () => void;
  onShare: () => void;
}) {
  const itens = useMemo(
    () => parseDescriptionToPreviewItems(props.order.descricao),
    [props.order.descricao]
  );

  const totalCalc = useMemo(() => {
    const t = itens.reduce((acc, it) => acc + (it.value || 0), 0);
    return t > 0 ? t : Number(props.order.valor) || 0;
  }, [itens, props.order.valor]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="font-bold text-lg">Pré-visualização</div>
          <button className="border rounded p-2" onClick={props.onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-auto max-h-[75vh]">
          <div className="border-2 border-black rounded-lg p-4">
            <div className="text-sm">
              {props.tenantLoading ? (
                <div className="text-gray-600">Carregando dados da empresa...</div>
              ) : (
                <>
                  <div className="font-bold">{props.tenant?.name || ""}</div>
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <b>CNPJ:</b> {props.tenant?.cnpj || ""}
                    </div>
                    <div>
                      <b>IE:</b> {props.tenant?.ie || ""}
                    </div>
                  </div>
                  <div>
                    <b>Endereço:</b> {props.tenant?.endereco || ""}
                  </div>
                  <div>
                    <b>Fone:</b> {props.tenant?.phone ? maskPhone(props.tenant.phone) : ""}
                  </div>
                </>
              )}
            </div>

            <div className="border-t-2 border-black my-4" />

            <div className="text-sm">
              <div className="flex flex-wrap gap-4">
                <div>
                  <b>Data:</b> {props.order.dt_entrada}
                </div>
                <div>
                  <b>Status:</b> {props.order.status}
                </div>
                <div>
                  <b>Cliente:</b> {props.order.cliente_nome}
                </div>
                <div>
                  <b>Fone:</b>{" "}
                  {props.order.cliente_telefone ? maskPhone(props.order.cliente_telefone) : ""}
                </div>
              </div>
            </div>

            <div className="border-t-2 border-black my-4" />

            <div className="text-center font-bold text-lg">{props.order.item || ""}</div>

            <div className="border-t-2 border-black my-4" />

            <div className="overflow-auto">
              <table className="min-w-full border-2 border-black">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border-2 border-black px-3 py-2 w-[80px] text-left">Item</th>
                    <th className="border-2 border-black px-3 py-2 text-left">Descrição</th>
                    <th className="border-2 border-black px-3 py-2 w-[160px] text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr>
                      <td className="border-2 border-black px-3 py-2">1</td>
                      <td className="border-2 border-black px-3 py-2">—</td>
                      <td className="border-2 border-black px-3 py-2 text-right">
                        {formatBRLFromNumber(totalCalc)}
                      </td>
                    </tr>
                  ) : (
                    itens.map((it) => (
                      <tr key={it.n}>
                        <td className="border-2 border-black px-3 py-2">{it.n}</td>
                        <td className="border-2 border-black px-3 py-2">{it.desc}</td>
                        <td className="border-2 border-black px-3 py-2 text-right">
                          {formatBRLFromNumber(it.value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-right font-extrabold text-xl mt-4">
              TOTAL: {formatBRLFromNumber(totalCalc)}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <button className="border px-3 py-2 rounded inline-flex items-center gap-2" onClick={props.onPrint}>
            <Printer size={16} />
            Imprimir
          </button>

          <button className="border px-3 py-2 rounded inline-flex items-center gap-2" onClick={props.onShare}>
            <Share2 size={16} />
            Compartilhar
          </button>

          <button className="bg-black text-white px-3 py-2 rounded" onClick={props.onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
