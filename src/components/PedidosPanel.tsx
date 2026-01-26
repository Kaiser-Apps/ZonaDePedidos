"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Trash2,
  Eye,
  X,
  Printer,
  Share2,
  Copy,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { toPng } from "html-to-image";

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
  logo_url: string | null;
};

type ClientMini = {
  id: string;
  nome: string;
  telefone: string;
};

type DiscountType = "none" | "percent" | "amount";

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

  // ✅ valor final (com desconto)
  valor: number;

  // ✅ campos novos
  valor_bruto: number | null;
  desconto_tipo: string | null; // "percent" | "amount" | null
  desconto_valor: number | null;

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

  // ✅ este campo na UI representa o BRUTO (antes do desconto)
  valor: string;

  // ✅ desconto
  desconto_tipo: DiscountType;
  desconto_valor: string;

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
        `${ddd ? "(" + ddd + ")" : ""}${p1 ? " " + p1 : ""}${
          p2 ? "-" + p2 : ""
        }`
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function calcDiscount(subtotal: number, type: DiscountType, valueInput: string) {
  const v = parseBRLToNumber(valueInput);

  if (subtotal <= 0) {
    return { discount: 0, total: 0 };
  }

  if (type === "none") {
    return { discount: 0, total: subtotal };
  }

  if (type === "percent") {
    // aqui o valueInput vem como "10" (não moeda) se o usuário digitar "10"
    // então vamos interpretar como percentual direto.
    // Se digitarem "10,5" funciona também.
    const pct = clamp(
      Number(String(valueInput || "").replace(".", "").replace(",", ".")) || 0,
      0,
      100
    );
    const discount = clamp((subtotal * pct) / 100, 0, subtotal);
    return { discount, total: subtotal - discount };
  }

  // amount: valueInput é BRL, então v já é R$ correto
  const discount = clamp(v, 0, subtotal);
  return { discount, total: subtotal - discount };
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
  const cliente = (order.cliente_nome || "").trim() || "Cliente";
  const empresa = (tenant?.name || "").trim() || "nossa empresa";
  const status = String(order.status || "").trim().toLowerCase();

  let headline = `Detalhes do Pedido - ${order.status}`;
  if (status === "aberto") {
    headline = "Segue detalhes do seu pedido aberto conosco.";
  } else if (status === "orçamento" || status === "orcamento") {
    headline = "Segue detalhes do seu orçamento.";
  } else if (status === "aguardando retirada") {
    headline = "Seu pedido já está pronto e aguardando retirada.";
  }

  const itens = parseDescriptionToPreviewItems(order.descricao);
  const subtotalFromItens = itens.reduce((acc, it) => acc + (it.value || 0), 0);

  const subtotal =
    (order.valor_bruto != null && Number(order.valor_bruto) >= 0
      ? Number(order.valor_bruto)
      : 0) ||
    (subtotalFromItens > 0 ? subtotalFromItens : 0) ||
    Number(order.valor || 0);

  const discountType: DiscountType =
    order.desconto_tipo === "percent"
      ? "percent"
      : order.desconto_tipo === "amount"
      ? "amount"
      : "none";

  const discountValueStr =
    discountType === "percent"
      ? String(order.desconto_valor ?? 0)
      : maskBRL(String(Math.round(Number(order.desconto_valor || 0) * 100)));

  const { discount, total } = calcDiscount(subtotal, discountType, discountValueStr);

  const totalFinal = Number(order.valor || 0) || total;

  const lines = [
    `Olá ${cliente}, aqui é ${empresa}`,
    headline,
    `Data: ${order.dt_entrada}`,
    "",
    order.item ? `Item: ${order.item}` : "",
    "Itens:",
    ...(itens.length > 0
      ? itens.map(
          (it) => `- ${it.n}) ${it.desc} — ${formatBRLFromNumber(it.value)}`
        )
      : ["- 1) —"]),
    "",
    `SUBTOTAL: ${formatBRLFromNumber(subtotal)}`,
    discount > 0
      ? `DESCONTO: -${formatBRLFromNumber(discount)}${
          discountType === "percent" ? ` (${order.desconto_valor ?? 0}%)` : ""
        }`
      : "",
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
  const subtotalItens = itens.reduce((acc, it) => acc + (it.value || 0), 0);

  const subtotal =
    (order.valor_bruto != null && Number(order.valor_bruto) >= 0
      ? Number(order.valor_bruto)
      : 0) ||
    (subtotalItens > 0 ? subtotalItens : 0) ||
    Number(order.valor) ||
    0;

  const discountType: DiscountType =
    order.desconto_tipo === "percent"
      ? "percent"
      : order.desconto_tipo === "amount"
      ? "amount"
      : "none";

  const discountValueStr =
    discountType === "percent"
      ? String(order.desconto_valor ?? 0)
      : maskBRL(String(Math.round(Number(order.desconto_valor || 0) * 100)));

  const { discount, total } = calcDiscount(subtotal, discountType, discountValueStr);
  const totalFinal = Number(order.valor || 0) || total;

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
    .totals { margin-top: 10px; font-size: 12px; }
    .totals .row { display:flex; justify-content:flex-end; gap:16px; margin-top: 6px; }
    .totals .label { min-width: 110px; text-align:right; }
    .totals .value { min-width: 140px; text-align:right; font-weight: 700; }
    .grand { font-weight: 900; font-size: 16px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="muted">
      ${
        tenant?.logo_url
          ? `<div style="margin-bottom:8px;"><img src="${tenant.logo_url}" alt="Logo" style="max-height:80px; max-width:260px; object-fit:contain;" /></div>`
          : ""
      }
      <div><b>${tenant?.name || ""}</b></div>
      <div>${tenant?.cnpj ? `<b>CNPJ:</b> ${tenant.cnpj}` : ""} ${
    tenant?.ie ? `&nbsp;&nbsp;<b>IE:</b> ${tenant.ie}` : ""
  }</div>
      <div>${tenant?.endereco ? `<b>Endereço:</b> ${tenant.endereco}` : ""}</div>
      <div>${tenant?.phone ? `<b>Fone:</b> ${maskPhone(tenant.phone)}` : ""}</div>
    </div>

    <div class="hr"></div>

    <div class="muted" style="display:flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <div><b>Data:</b> ${order.dt_entrada}</div>
      <div><b>Status:</b> ${order.status}</div>
      <div><b>Cliente:</b> ${escapeHtml(order.cliente_nome)}</div>
      <div><b>Fone:</b> ${
        order.cliente_telefone ? maskPhone(order.cliente_telefone) : ""
      }</div>
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
            ? `<tr><td>1</td><td>—</td><td class="right">${formatBRLFromNumber(
                subtotal
              )}</td></tr>`
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

    <div class="totals">
      <div class="row"><div class="label">SUBTOTAL:</div><div class="value">${formatBRLFromNumber(
        subtotal
      )}</div></div>
      ${
        discount > 0
          ? `<div class="row"><div class="label">DESCONTO:</div><div class="value">-${formatBRLFromNumber(
              discount
            )}${discountType === "percent" ? ` (${order.desconto_valor ?? 0}%)` : ""}</div></div>`
          : ""
      }
      <div class="row grand"><div class="label">TOTAL:</div><div class="value">${formatBRLFromNumber(
        totalFinal
      )}</div></div>
    </div>
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

function dataUrlToFile(dataUrl: string, fileName: string) {
  const arr = dataUrl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], fileName, { type: mime });
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function isDuplicateErr(err: any) {
  const msg = (err?.message || "").toLowerCase();
  return err?.code === "23505" || msg.includes("duplicate") || msg.includes("uq_");
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

  desconto_tipo: "none",
  desconto_valor: "",

  status: "aberto",
});

export default function PedidosPanel() {
  const [ctx, setCtx] = useState<TenantCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [statusTab, setStatusTab] =
    useState<(typeof STATUSES)[number]>("aberto");

  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusCountsLoading, setStatusCountsLoading] = useState(false);

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

  useEffect(() => {
    const loadTenant = async () => {
      if (!ctx?.tenantId) return;

      setTenantLoading(true);
      setTenantError(null);

      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, cnpj, ie, endereco, phone, logo_url")
        .eq("id", ctx.tenantId)
        .maybeSingle();

      setTenantLoading(false);

      if (error) {
        console.log("[PEDIDOS] load tenant error:", error);
        setTenantInfo(null);
        setTenantError(error.message);
        return;
      }

      if (!data) {
        setTenantInfo(null);
        setTenantError(
          "Nenhum tenant retornado (provável RLS sem policy de SELECT)."
        );
        return;
      }

      setTenantInfo(data as TenantInfo);
    };

    loadTenant();
  }, [ctx?.tenantId]);

  const loadStatusCounts = async () => {
    if (!ctx) return;

    setStatusCountsLoading(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("status")
        .eq("tenant_id", ctx.tenantId)
        .limit(5000);

      if (error) {
        console.log("[PEDIDOS] loadStatusCounts error:", error);
        return;
      }

      const map: Record<string, number> = {};
      for (const row of (data || []) as any[]) {
        const s = String(row.status || "");
        if (!s) continue;
        map[s] = (map[s] || 0) + 1;
      }

      setStatusCounts(map);

      const current = statusTab as string;
      const currentCount = map[current] || 0;
      const keepAlways = "aberto";
      if (current !== keepAlways && currentCount === 0) {
        const firstWith = STATUSES.find((st) => (map[st] || 0) > 0);
        if (firstWith) setStatusTab(firstWith);
      }
    } finally {
      setStatusCountsLoading(false);
    }
  };

  const loadOrders = async (status: string) => {
    if (!ctx) return;
    setOrdersLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, dt_entrada, dt_saida, client_id, cliente_nome, cliente_telefone, item, descricao, valor, valor_bruto, desconto_tipo, desconto_valor, status"
      )
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
    loadStatusCounts();
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
    const bruto = o.valor_bruto != null ? Number(o.valor_bruto) : Number(o.valor || 0);
    const valorMasked = maskBRL(String(Math.round((bruto || 0) * 100)));

    const descontoTipo: DiscountType =
      o.desconto_tipo === "percent"
        ? "percent"
        : o.desconto_tipo === "amount"
        ? "amount"
        : "none";

    const descontoValor =
      descontoTipo === "percent"
        ? String(o.desconto_valor ?? "")
        : descontoTipo === "amount"
        ? maskBRL(String(Math.round(Number(o.desconto_valor || 0) * 100)))
        : "";

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
      desconto_tipo: descontoTipo,
      desconto_valor: descontoValor,
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
    await loadStatusCounts();
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

  const ensureClientId = async (args: {
    tenantId: string;
    userId: string;
    cliente_nome: string;
    cliente_telefone: string;
    currentClientId: string;
  }): Promise<{ clientId: string; telefoneNorm: string | null }> => {
    const current = (args.currentClientId || "").trim();
    if (current) {
      const telNorm = args.cliente_telefone
        ? onlyDigits(args.cliente_telefone)
        : "";
      return { clientId: current, telefoneNorm: telNorm || null };
    }

    const nome = (args.cliente_nome || "").trim();
    const telefoneNorm = args.cliente_telefone
      ? onlyDigits(args.cliente_telefone)
      : "";

    if (!telefoneNorm) {
      throw new Error(
        "Para cadastrar um cliente novo, informe o telefone do cliente."
      );
    }

    const { data: found, error: findErr } = await supabase
      .from("clients")
      .select("id, telefone")
      .eq("tenant_id", args.tenantId)
      .eq("telefone", telefoneNorm)
      .maybeSingle();

    if (findErr) {
      console.log("[PEDIDOS] ensureClientId find error:", findErr);
    }

    if (found?.id) {
      return { clientId: String(found.id), telefoneNorm };
    }

    const insertPayload = {
      tenant_id: args.tenantId,
      nome: nome || "Sem nome",
      telefone: telefoneNorm,
      endereco: null,
      cpf: null,
      cnpj: null,
      ie: null,
      created_by: args.userId,
      updated_by: args.userId,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("clients")
      .insert([insertPayload])
      .select("id")
      .maybeSingle();

    if (insErr) {
      if (isDuplicateErr(insErr)) {
        const { data: found2 } = await supabase
          .from("clients")
          .select("id")
          .eq("tenant_id", args.tenantId)
          .eq("telefone", telefoneNorm)
          .maybeSingle();

        if (found2?.id) {
          return { clientId: String(found2.id), telefoneNorm };
        }
      }

      console.log("[PEDIDOS] ensureClientId insert error:", insErr);
      throw new Error("Não foi possível cadastrar o cliente automaticamente.");
    }

    if (!inserted?.id) {
      throw new Error("Cliente não retornou ID após cadastro.");
    }

    return { clientId: String(inserted.id), telefoneNorm };
  };

  const save = async () => {
    if (!ctx) return;

    const dt_entrada = (form.dt_entrada || "").trim();
    if (!dt_entrada) return alert("Preencha a data de entrada.");

    const cliente_nome = (form.cliente_nome || clientQ || "").trim();
    if (!cliente_nome) return alert("Selecione ou digite o cliente.");

    const valorBruto = parseBRLToNumber(form.valor);
    if (valorBruto <= 0) return alert("Preencha um valor maior que zero.");

    // ✅ calcula desconto e total final
    const { discount, total } = calcDiscount(
      valorBruto,
      form.desconto_tipo,
      form.desconto_valor
    );

    const descontoTipoDb =
      form.desconto_tipo === "percent"
        ? "percent"
        : form.desconto_tipo === "amount"
        ? "amount"
        : null;

    const descontoValorDb =
      form.desconto_tipo === "none"
        ? null
        : form.desconto_tipo === "percent"
        ? clamp(
            Number(String(form.desconto_valor || "").replace(".", "").replace(",", ".")) || 0,
            0,
            100
          )
        : clamp(parseBRLToNumber(form.desconto_valor), 0, valorBruto);

    setSaving(true);

    try {
      let finalClientId: string | null = form.client_id ? form.client_id : null;
      let finalTelefoneNorm: string | null = form.cliente_telefone
        ? onlyDigits(form.cliente_telefone)
        : null;

      try {
        const ensured = await ensureClientId({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          cliente_nome,
          cliente_telefone: form.cliente_telefone || "",
          currentClientId: form.client_id || "",
        });

        finalClientId = ensured.clientId || null;
        finalTelefoneNorm = ensured.telefoneNorm || null;

        if (finalClientId && finalClientId !== form.client_id) {
          setForm((s) => ({
            ...s,
            client_id: finalClientId || "",
          }));
        }
      } catch (e: any) {
        alert(e?.message || "Erro ao garantir cadastro do cliente.");
        return;
      }

      const payload = {
        tenant_id: ctx.tenantId,
        dt_entrada,
        dt_saida: form.dt_saida ? form.dt_saida : null,
        client_id: finalClientId,
        cliente_nome,
        cliente_telefone: finalTelefoneNorm,
        item: form.item ? form.item.trim() : null,
        descricao: form.descricao ? form.descricao.trim() : null,

        // ✅ salva bruto + desconto + final
        valor_bruto: valorBruto,
        desconto_tipo: descontoTipoDb,
        desconto_valor: descontoValorDb,
        valor: total,

        status: form.status,
        updated_by: ctx.userId,
      };

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
      await loadStatusCounts();
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
          Não foi possível carregar seu tenant. Verifique se existe um registro
          na tabela <b>profiles</b> para seu usuário.
        </div>
      </div>
    );
  }

  const ALWAYS_SHOW: (typeof STATUSES)[number][] = ["aberto"];

  const visibleStatuses = STATUSES.filter((s) => {
    const count = statusCounts[s] || 0;
    if (ALWAYS_SHOW.includes(s)) return true;
    return count > 0;
  });

  const brutoUI = parseBRLToNumber(form.valor);
  const { discount: discountUI, total: totalUI } = calcDiscount(
    brutoUI,
    form.desconto_tipo,
    form.desconto_valor
  );

  return (
    <div className="space-y-4">
      <div className="border rounded p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-bold text-lg">
              {isEdit ? "Editar Pedido" : "Novo Pedido"}
            </div>
            <div className="text-sm text-gray-600">
              Status atual: {form.status}
            </div>
            {tenantError && (
              <div className="text-xs text-red-600 mt-1">
                Tenant não carregou: {tenantError}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {isEdit && (
              <button
                className="border px-3 py-2 rounded w-full sm:w-auto"
                onClick={resetForm}
                disabled={saving}
              >
                Cancelar edição
              </button>
            )}

            <button
              className="bg-black text-white px-3 py-2 rounded w-full sm:w-auto"
              onClick={save}
              disabled={saving}
            >
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
              onChange={(e) =>
                setForm((s) => ({ ...s, status: e.target.value }))
              }
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

            {showClientDropdown &&
              (clientLoading || clientOptions.length > 0) && (
                <div className="absolute z-10 mt-1 w-full border bg-white rounded shadow">
                  {clientLoading ? (
                    <div className="p-3 text-sm text-gray-600">Buscando...</div>
                  ) : clientOptions.length === 0 ? (
                    <div className="p-3 text-sm text-gray-600">
                      Nenhum cliente encontrado.
                    </div>
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
                        <div className="text-xs text-gray-600">
                          {maskPhone(c.telefone || "")}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
          </div>

          <Field
            label="Telefone do cliente"
            value={form.cliente_telefone}
            onChange={(v) =>
              setForm((s) => ({ ...s, cliente_telefone: maskPhone(v) }))
            }
            placeholder="(11) 99999-9999"
          />

          <Field
            label="Item"
            value={form.item}
            onChange={(v) => setForm((s) => ({ ...s, item: v }))}
            placeholder="Ex: Produto / Serviço"
          />

          <Field
            label="Valor (subtotal) *"
            value={form.valor}
            onChange={(v) => setForm((s) => ({ ...s, valor: maskBRL(v) }))}
            placeholder="0,00"
          />

          {/* ✅ DESCONTO */}
          <label className="block">
            <div className="text-sm font-medium mb-1">Desconto</div>
            <select
              className="border rounded px-3 py-2 w-full"
              value={form.desconto_tipo}
              onChange={(e) => {
                const next = e.target.value as DiscountType;
                setForm((s) => ({
                  ...s,
                  desconto_tipo: next,
                  desconto_valor: next === "none" ? "" : s.desconto_valor,
                }));
              }}
            >
              <option value="none">Sem desconto</option>
              <option value="percent">Percentual (%)</option>
              <option value="amount">Em reais (R$)</option>
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium mb-1">
              {form.desconto_tipo === "percent"
                ? "Valor do desconto (%)"
                : form.desconto_tipo === "amount"
                ? "Valor do desconto (R$)"
                : "Valor do desconto"}
            </div>

            <input
              className="border rounded px-3 py-2 w-full disabled:opacity-60"
              disabled={form.desconto_tipo === "none"}
              value={form.desconto_valor}
              onChange={(e) => {
                const v = e.target.value;

                if (form.desconto_tipo === "percent") {
                  const cleaned = v
                    .replace(/[^\d,]/g, "")
                    .replace(/(,.*),/g, "$1");
                  setForm((s) => ({ ...s, desconto_valor: cleaned }));
                } else if (form.desconto_tipo === "amount") {
                  setForm((s) => ({
                    ...s,
                    desconto_valor: maskBRL(v),
                  }));
                } else {
                  setForm((s) => ({ ...s, desconto_valor: "" }));
                }
              }}
              placeholder={
                form.desconto_tipo === "percent"
                  ? "Ex: 10"
                  : form.desconto_tipo === "amount"
                  ? "Ex: 50,00"
                  : ""
              }
            />
          </label>

          {/* ✅ RESUMO */}
          <div className="md:col-span-3">
            <div className="border rounded p-3 bg-slate-50 text-sm">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:gap-6">
                <div>
                  <div className="text-xs text-slate-600">Subtotal</div>
                  <div className="font-semibold">
                    {formatBRLFromNumber(brutoUI)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-600">Desconto</div>
                  <div className="font-semibold">
                    -{formatBRLFromNumber(discountUI)}
                    {form.desconto_tipo === "percent" && form.desconto_valor
                      ? ` (${form.desconto_valor}%)`
                      : ""}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-600">Total</div>
                  <div className="font-extrabold text-base">
                    {formatBRLFromNumber(totalUI)}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 mt-2">
                Observação: o total final será salvo em <b>valor</b> e o subtotal em{" "}
                <b>valor_bruto</b>.
              </div>
            </div>
          </div>

          <label className="block md:col-span-3">
            <div className="text-sm font-medium mb-1">
              Descrição (soma automática por linha)
            </div>
            <textarea
              className="border rounded px-3 py-2 w-full min-h-[110px]"
              value={form.descricao}
              onChange={(e) => {
                const desc = e.target.value;
                const total = calculateTotalFromDescription(desc);

                setForm((s) => ({
                  ...s,
                  descricao: desc,
                  valor:
                    total > 0
                      ? maskBRL(String(Math.round(total * 100)))
                      : s.valor,
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


      <div className="border rounded p-4">
        <div className="flex flex-wrap gap-2 items-center">
          {statusCountsLoading && (
            <div className="text-xs text-gray-500 mr-2">
              Atualizando status...
            </div>
          )}

          {visibleStatuses.map((s) => {
            const count = statusCounts[s] || 0;
            const label = `${s} (${count})`;

            return (
              <button
                key={s}
                onClick={() => setStatusTab(s)}
                className={`px-3 py-2 rounded border ${
                  statusTab === s ? "bg-black text-white" : ""
                }`}
                title={label}
              >
                {label}
              </button>
            );
          })}
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
                  <th className="border px-3 py-2">Total</th>
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
                          {o.cliente_telefone
                            ? maskPhone(o.cliente_telefone)
                            : ""}
                        </div>
                      </td>

                      <td className="border px-3 py-2">{o.item || ""}</td>

                      <td className="border px-3 py-2">
                        {formatBRLFromNumber(Number(o.valor) || 0)}
                        {o.desconto_tipo && o.desconto_valor != null ? (
                          <div className="text-xs text-slate-600">
                            desconto{" "}
                            {o.desconto_tipo === "percent"
                              ? `${o.desconto_valor}%`
                              : formatBRLFromNumber(Number(o.desconto_valor) || 0)}
                          </div>
                        ) : null}
                      </td>

                      <td className="border px-3 py-2">{o.status}</td>

                      <td className="border px-3 py-2">
                        <div className="flex gap-2 items-center">
                          <button
                            className="border px-2 py-1 rounded"
                            onClick={() => pickOrderToEdit(o)}
                          >
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

type FieldProps = {
  label: string;
  value: any;
  onChange: (v: any) => void;
  placeholder?: string;
  type?: string; // ✅ adiciona isso
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text", // ✅ default seguro
}: FieldProps) {
  return (
    <label className="block min-w-0">
      <div className="text-sm font-medium mb-1">{label}</div>

      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border rounded px-3 py-2 w-full max-w-full min-w-0 appearance-none"
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

  const subtotal = useMemo(() => {
    const itensTotal = itens.reduce((acc, it) => acc + (it.value || 0), 0);

    if (props.order.valor_bruto != null && Number(props.order.valor_bruto) >= 0) {
      return Number(props.order.valor_bruto) || 0;
    }

    if (itensTotal > 0) return itensTotal;
    return Number(props.order.valor) || 0;
  }, [itens, props.order.valor, props.order.valor_bruto]);

  const discountType: DiscountType = useMemo(() => {
    if (props.order.desconto_tipo === "percent") return "percent";
    if (props.order.desconto_tipo === "amount") return "amount";
    return "none";
  }, [props.order.desconto_tipo]);

  const discountValueStr = useMemo(() => {
    if (discountType === "percent") return String(props.order.desconto_valor ?? 0);
    if (discountType === "amount")
      return maskBRL(String(Math.round(Number(props.order.desconto_valor || 0) * 100)));
    return "";
  }, [discountType, props.order.desconto_valor]);

  const { discount, total } = useMemo(
    () => calcDiscount(subtotal, discountType, discountValueStr),
    [subtotal, discountType, discountValueStr]
  );

  const totalFinal = useMemo(() => {
    // valor salvo já deve ser o total final
    const saved = Number(props.order.valor || 0);
    return saved > 0 ? saved : total;
  }, [props.order.valor, total]);

  const previewRef = useRef<HTMLDivElement | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [sharingImg, setSharingImg] = useState(false);
  const [downloadingImg, setDownloadingImg] = useState(false);
  const shareBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShareOpen(false);
    };

    const onClickOutside = (e: MouseEvent) => {
      if (!shareOpen) return;
      const el = shareBoxRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target))
        setShareOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [shareOpen]);

  const buildPng = async (): Promise<{ dataUrl: string; fileName: string } | null> => {
    if (!previewRef.current) return null;

    const node = previewRef.current;
    if (!node) return null;

    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      style: { transform: "scale(1)", transformOrigin: "top left" },
    });


    const fileName = `pedido-${
      props.order.dt_entrada || new Date().toISOString().slice(0, 10)
    }.png`;

    return { dataUrl, fileName };
  };

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const PAPER_W = 900;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();

      const availW = rect.width;

      // ✅ escala só pela largura (altura vai no scroll)
      const sW = availW / PAPER_W;

      const next = Math.min(1, sW);
      setScale(next > 0 ? next : 1);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  const shareImage = async () => {
    setSharingImg(true);
    try {
      const built = await buildPng();
      if (!built) return;

      const { dataUrl, fileName } = built;
      const file = dataUrlToFile(dataUrl, fileName);

      const navAny = navigator as any;
      const canShareFiles =
        typeof navAny !== "undefined" &&
        typeof navAny.share === "function" &&
        typeof navAny.canShare === "function" &&
        navAny.canShare({ files: [file] });

      if (canShareFiles) {
        await navAny.share({
          title: "Pedido",
          text: "Segue o pedido em imagem.",
          files: [file],
        });
      } else {
        downloadDataUrl(dataUrl, fileName);
        alert(
          "Seu navegador não suportou compartilhar arquivo. Fiz o download do PNG."
        );
      }
    } catch (err: any) {
      console.log("[PEDIDOS] share image error:", err);
      alert("Não foi possível gerar a imagem. Veja o console para detalhes.");
    } finally {
      setSharingImg(false);
    }
  };

  const downloadImage = async () => {
    setDownloadingImg(true);
    try {
      const built = await buildPng();
      if (!built) return;

      const { dataUrl, fileName } = built;
      downloadDataUrl(dataUrl, fileName);
    } catch (err: any) {
      console.log("[PEDIDOS] download image error:", err);
      alert("Não foi possível baixar a imagem. Veja o console para detalhes.");
    } finally {
      setDownloadingImg(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg w-[1024px] shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="font-bold text-lg">Pré-visualização</div>
          <button
            className="border rounded p-2"
            onClick={props.onClose}
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div ref={stageRef} className="overflow-auto h-[75vh]">
            <div className="flex justify-center">
              <div
                style={{
                  width: PAPER_W,
                  transform: `scale(${scale})`,
                  transformOrigin: "top center",
                }}
              >
                {/* ✅ ESTE é o container que será impresso/baixado */}
                <div
                  ref={previewRef}
                  className="border-2 border-black rounded-lg p-4 bg-white"
                  style={{ width: PAPER_W }}
                >
                  <div className="text-sm">
                    {props.tenantLoading ? (
                      <div className="text-gray-600">
                        Carregando dados da empresa...
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1fr_240px] gap-4 items-start">
                          <div className="min-w-0">
                            <div className="font-bold text-base">
                              {props.tenant?.name || ""}
                            </div>

                            <div className="flex gap-4 mt-1">
                              <div>
                                <b>CNPJ:</b> {props.tenant?.cnpj || ""}
                              </div>
                              <div>
                                <b>IE:</b> {props.tenant?.ie || ""}
                              </div>
                            </div>

                            <div className="mt-1">
                              <b>Endereço:</b> {props.tenant?.endereco || ""}
                            </div>

                            <div className="mt-1">
                              <b>Fone:</b>{" "}
                              {props.tenant?.phone ? maskPhone(props.tenant.phone) : ""}
                            </div>
                          </div>

                          <div className="flex justify-end">
                            {props.tenant?.logo_url ? (
                              <img
                                src={props.tenant.logo_url}
                                alt="Logo da empresa"
                                className="max-h-[200px] max-w-[300px] object-contain"
                                crossOrigin="anonymous"
                              />
                            ) : null}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t-2 border-black my-4" />

                  <div className="text-sm space-y-1">
                    <div className="flex gap-6">
                      <div>
                        <b>Data:</b> {props.order.dt_entrada}
                      </div>
                      <div>
                        <b>Status:</b> {props.order.status}
                      </div>
                    </div>

                    <div className="flex gap-6">
                      <div>
                        <b>Cliente:</b> {props.order.cliente_nome}
                      </div>
                      <div>
                        <b>Fone:</b>{" "}
                        {props.order.cliente_telefone
                          ? maskPhone(props.order.cliente_telefone)
                          : ""}
                      </div>
                    </div>
                  </div>
        

                  <div className="border-t-2 border-black my-4" />

                  <div className="text-center font-bold text-lg">
                    {props.order.item || ""}
                  </div>

                  <div className="border-t-2 border-black my-4" />

                  <div className="overflow-auto">
                    <table className="min-w-full border-2 border-black">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border-2 border-black px-3 py-2 w-[80px] text-left">
                            Item
                          </th>
                          <th className="border-2 border-black px-3 py-2 text-left">
                            Descrição
                          </th>
                          <th className="border-2 border-black px-3 py-2 w-[160px] text-right">
                            Valor
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.length === 0 ? (
                          <tr>
                            <td className="border-2 border-black px-3 py-2">1</td>
                            <td className="border-2 border-black px-3 py-2">—</td>
                            <td className="border-2 border-black px-3 py-2 text-right">
                              {formatBRLFromNumber(subtotal)}
                            </td>
                          </tr>
                        ) : (
                          itens.map((it) => (
                            <tr key={it.n}>
                              <td className="border-2 border-black px-3 py-2">{it.n}</td>
                              <td className="border-2 border-black px-3 py-2">
                                {it.desc}
                              </td>
                              <td className="border-2 border-black px-3 py-2 text-right">
                                {formatBRLFromNumber(it.value)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ✅ TOTAIS */}
                  <div className="mt-4 text-sm flex flex-col items-end gap-1">
                    <div>
                      <b>SUBTOTAL:</b> {formatBRLFromNumber(subtotal)}
                    </div>

                    {discount > 0 ? (
                      <div>
                        <b>DESCONTO:</b> -{formatBRLFromNumber(discount)}
                        {discountType === "percent"
                          ? ` (${props.order.desconto_valor ?? 0}%)`
                          : ""}
                      </div>
                    ) : null}

                    <div className="font-extrabold text-xl">
                      TOTAL: {formatBRLFromNumber(totalFinal)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <button
            className="border px-3 py-2 rounded inline-flex items-center gap-2"
            onClick={props.onPrint}
          >
            <Printer size={16} />
            Imprimir
          </button>

          <div className="relative" ref={shareBoxRef}>
            <button
              className="border px-3 py-2 rounded inline-flex items-center gap-2"
              onClick={() => setShareOpen((v) => !v)}
              type="button"
            >
              <Share2 size={16} />
              Compartilhar
            </button>

            {shareOpen && (
              <div className="absolute right-0 bottom-12 z-50 w-64 rounded border bg-white shadow overflow-hidden">
                <button
                  type="button"
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50"
                  onClick={async () => {
                    setShareOpen(false);
                    await props.onShare();
                  }}
                >
                  <Copy size={16} />
                  Copiar texto
                </button>

                <button
                  type="button"
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 disabled:opacity-60"
                  disabled={sharingImg}
                  onClick={async () => {
                    setShareOpen(false);
                    await shareImage();
                  }}
                >
                  <ImageIcon size={16} />
                  {sharingImg ? "Gerando imagem..." : "Gerar / compartilhar imagem"}
                </button>

                <button
                  type="button"
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 disabled:opacity-60"
                  disabled={downloadingImg}
                  onClick={async () => {
                    setShareOpen(false);
                    await downloadImage();
                  }}
                >
                  <Download size={16} />
                  {downloadingImg ? "Baixando..." : "Baixar imagem (PNG)"}
                </button>
              </div>
            )}
          </div>

          <button
            className="bg-black text-white px-3 py-2 rounded"
            onClick={props.onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );

}
