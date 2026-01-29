"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { toCanvas } from "html-to-image";


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

type ProductMini = {
  id: string;
  nome: string;
  client_id: string | null;
  identificador?: string | null;
  marca?: string | null;
  modelo?: string | null;
  observacao?: string | null;
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
  produto: string | null;
  product_id: string | null;
  descricao: string | null;
  observacao: string | null;

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
  // legacy single-product fields (kept for backward compatibility)
  produto: string;
  product_id: string;
  descricao: string;
  observacao: string;

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
    order.produto ? `Produto: ${order.produto}` : "",
    order.item ? `Item: ${order.item}` : "",
    "Itens:",
    ...(itens.length > 0
      ? itens.map(
          (it) => `- ${it.n}) ${it.desc} — ${formatBRLFromNumber(it.value)}`
        )
      : ["- 1) —"]),
    order.observacao ? `Observação: ${order.observacao}` : "",
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
    @page { size: A4; margin: 12mm; }
    html, body { height: 100%; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .box { border: 2px solid #111; padding: 10mm; border-radius: 8px; box-sizing: border-box; }

    .muted { color: #111; font-size: 14px; }
    .hr { border-top: 2px solid #111; margin: 10px 0; }

    table { width:100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
    thead { display: table-header-group; } /* repete cabeçalho */
    tfoot { display: table-footer-group; }

    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td { border: 2px solid #111; padding: 8px; font-size: 14px; vertical-align: top; }
    th { text-align:left; background: #f5f5f5; }

    .right { text-align:right; }

    .totals { margin-top: 10px; font-size: 14px; break-inside: avoid; page-break-inside: avoid; }
    .totals .row { display:flex; justify-content:flex-end; gap:16px; margin-top: 6px; }
    .totals .label { min-width: 110px; text-align:right; }
    .totals .value { min-width: 140px; text-align:right; font-weight: 700; }
    .grand { font-weight: 900; font-size: 18px; }

    /* opcional: evita quebras estranhas no topo */
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
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

    ${
      order.produto
        ? `<div class="muted" style="margin-top:8px;"><b>Produto:</b> ${escapeHtml(
            order.produto
          )}</div>`
        : ""
    }

    <div class="hr"></div>

    <div style="text-align:center; font-weight:700; margin: 6px 0;">
      ${escapeHtml(order.item || "")}
    </div>

    ${
      order.observacao
        ? `<div class="muted avoid-break" style="margin: 10px 0; padding: 8px; border: 2px dashed #111; border-radius: 6px;">
            <b>Observação:</b> ${escapeHtml(order.observacao)}
           </div>`
        : ""
    }

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

function isDuplicateErr(err: unknown) {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  const msg = String(e?.message || "").toLowerCase();
  return e?.code === "23505" || msg.includes("duplicate") || msg.includes("uq_");
}

const emptyForm = (): OrderForm => ({
  dt_entrada: todayISO(),
  dt_saida: "",

  client_id: "",
  cliente_nome: "",
  cliente_telefone: "",

  item: "",
  produto: "",
  product_id: "",
  descricao: "",
  observacao: "",

  valor: "",

  desconto_tipo: "none",
  desconto_valor: "",

  status: "aberto",
});

export default function PedidosPanel() {
  const searchParams = useSearchParams();

  const [ctx, setCtx] = useState<TenantCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [statusTab, setStatusTab] =
    useState<(typeof STATUSES)[number]>("aberto");

  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [orderSearch, setOrderSearch] = useState("");
  const [orderSearchDebounced, setOrderSearchDebounced] = useState("");
  const orderSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusCountsLoading, setStatusCountsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrderForm>(emptyForm());
  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  const [formOpen, setFormOpen] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<OrderRow | null>(null);

  const [clientQ, setClientQ] = useState("");
  const [clientLoading, setClientLoading] = useState(false);
  const [clientOptions, setClientOptions] = useState<ClientMini[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [products, setProducts] = useState<ProductMini[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const [productDetailsOpen, setProductDetailsOpen] = useState(false);
  const [productMeta, setProductMeta] = useState({
    identificador: "",
    marca: "",
    modelo: "",
    observacao: "",
  });

  const normalizeName = (v: string) =>
    String(v || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const findProductByName = (name: string) => {
    const key = normalizeName(name);
    if (!key) return null;
    return (
      products.find((p) => normalizeName(p.nome) === key) ||
      products.find((p) => normalizeName(p.nome).includes(key)) ||
      null
    );
  };

  useEffect(() => {
    if (orderSearchDebounceRef.current) {
      clearTimeout(orderSearchDebounceRef.current);
    }

    orderSearchDebounceRef.current = setTimeout(() => {
      setOrderSearchDebounced(orderSearch.trim());
    }, 250);

    return () => {
      if (orderSearchDebounceRef.current) {
        clearTimeout(orderSearchDebounceRef.current);
      }
    };
  }, [orderSearch]);

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

  useEffect(() => {
    let alive = true;

    const loadProducts = async () => {
      if (!ctx?.tenantId) return;

      // ✅ só mostra produtos quando existe cliente selecionado
      const clientId = (form.client_id || "").trim();
      if (!clientId) {
        setProducts([]);
        return;
      }

      setProductsLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, nome, client_id, identificador, marca, modelo, observacao")
        .eq("tenant_id", ctx.tenantId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(300);

      if (!alive) return;
      setProductsLoading(false);

      if (error) {
        console.log("[PEDIDOS] load products error:", error);
        setProducts([]);
        return;
      }

      setProducts((data || []) as ProductMini[]);
    };

    loadProducts();
    return () => {
      alive = false;
    };
  }, [ctx?.tenantId, form.client_id]);

  const buildOrdersOrFilter = (qRaw: string) => {
    const q = String(qRaw || "")
      .replace(/[,]/g, " ")
      .replace(/[%_]/g, " ")
      .trim();
    if (!q) return null;

    const pat = `%${q}%`;
    const parts = [
      `cliente_nome.ilike.${pat}`,
      `cliente_telefone.ilike.${pat}`,
      `item.ilike.${pat}`,
      `produto.ilike.${pat}`,
      `descricao.ilike.${pat}`,
      `observacao.ilike.${pat}`,
    ];

    const digits = onlyDigits(q);
    if (digits.length >= 2 && digits !== q) {
      parts.push(`cliente_telefone.ilike.%${digits}%`);
    }

    return parts.join(",");
  };

  const loadStatusCounts = async (qRaw?: string) => {
    if (!ctx) return;

    setStatusCountsLoading(true);

    try {
      const map: Record<string, number> = {};
      const ors = qRaw ? buildOrdersOrFilter(qRaw) : null;

      for (const st of STATUSES) {
        let q = supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", ctx.tenantId)
          .eq("status", st);

        if (ors) q = q.or(ors);

        const { error, count } = await q;
        if (error) {
          console.log("[PEDIDOS] loadStatusCounts error:", error);
          continue;
        }

        map[st] = count || 0;
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

  const loadOrders = async (status: string, qRaw?: string) => {
    if (!ctx) return;
    setOrdersLoading(true);

    const ors = qRaw ? buildOrdersOrFilter(qRaw) : null;

    let q = supabase
      .from("orders")
      .select(
        "id, created_at, dt_entrada, dt_saida, client_id, cliente_nome, cliente_telefone, item, produto, product_id, descricao, observacao, valor, valor_bruto, desconto_tipo, desconto_valor, status"
      )
      .eq("tenant_id", ctx.tenantId)
      .eq("status", status);

    if (ors) q = q.or(ors);

    const { data, error } = await q
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
    loadStatusCounts(orderSearchDebounced);
    loadOrders(statusTab, orderSearchDebounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, statusTab, orderSearchDebounced]);

  const resetForm = () => {
    setForm(emptyForm());
    setClientQ("");
    setClientOptions([]);
    setShowClientDropdown(false);
    setProducts([]);
    setProductsLoading(false);
    setProductDetailsOpen(false);
    setProductMeta({ identificador: "", marca: "", modelo: "", observacao: "" });
  };

  const openNewOrder = () => {
    resetForm();
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const novo = searchParams.get("novo");
    if (novo === "1" && !formOpen) {
      openNewOrder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, formOpen]);

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
      produto: o.produto || "",
      product_id: o.product_id || "",
      descricao: o.descricao || "",
      observacao: o.observacao || "",
      valor: valorMasked,
      desconto_tipo: descontoTipo,
      desconto_valor: descontoValor,
      status: (o.status as (typeof STATUSES)[number]) || "aberto",
    });

    setClientQ(o.cliente_nome || "");
    setShowClientDropdown(false);
    setClientOptions([]);

    // detalhes opcionais do produto ficam fechados por padrão; eles são preenchidos
    // automaticamente quando existir match no catálogo.
    setProductDetailsOpen(false);
    setProductMeta({ identificador: "", marca: "", modelo: "", observacao: "" });

    setFormOpen(true);
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

    await loadOrders(statusTab, orderSearchDebounced);
    await loadStatusCounts(orderSearchDebounced);
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

    const digits = onlyDigits(v);
    const looksLikePhone = digits.length >= 10 && digits.length <= 11 && !/[a-zA-Z]/.test(v);

    // Quando o usuário digita, ele pode estar:
    // - procurando outro cliente existente; ou
    // - criando um cliente novo.
    // Em ambos os casos, não podemos manter um client_id antigo selecionado.
    setForm((s) => {
      const hadSelected = Boolean((s.client_id || "").trim());

      return {
        ...s,
        client_id: "",
        // Se for um telefone (busca por telefone), não trata como nome.
        cliente_nome: looksLikePhone ? "" : v,
        // Se estava com cliente selecionado e começou a digitar outro, evita
        // carregar o telefone antigo para o novo cadastro.
        cliente_telefone: looksLikePhone
          ? maskPhone(digits)
          : hadSelected
          ? ""
          : s.cliente_telefone,
      };
    });

    // limpando o cliente, também limpa catálogo / seleção de produto
    setProducts([]);
    setProductDetailsOpen(false);
    setProductMeta({ identificador: "", marca: "", modelo: "", observacao: "" });

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

    // ao trocar cliente, reseta detalhes do produto
    setProductDetailsOpen(false);
    setProductMeta({ identificador: "", marca: "", modelo: "", observacao: "" });
  };

  // quando seleciona um produto, puxa os detalhes do catálogo
  useEffect(() => {
    const pid = (form.product_id || "").trim();
    const nome = String(form.produto || "").trim();

    const matched = pid
      ? products.find((p) => String(p.id) === pid)
      : nome
      ? products.find((p) => normalizeName(p.nome) === normalizeName(nome))
      : null;

    if (!matched) return;

    setProductMeta({
      identificador: matched.identificador ? String(matched.identificador) : "",
      marca: matched.marca ? String(matched.marca) : "",
      modelo: matched.modelo ? String(matched.modelo) : "",
      observacao: matched.observacao ? String(matched.observacao) : "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_id, form.produto, products.length]);

  const ensureClientId = async (args: {
    tenantId: string;
    userId: string;
    cliente_nome: string;
    cliente_telefone: string;
    currentClientId: string;
  }): Promise<{
    clientId: string;
    telefoneNorm: string | null;
    existed: boolean;
    clientNome: string | null;
  }> => {
    const current = (args.currentClientId || "").trim();
    if (current) {
      const telNorm = args.cliente_telefone
        ? onlyDigits(args.cliente_telefone)
        : "";
      return {
        clientId: current,
        telefoneNorm: telNorm || null,
        existed: false,
        clientNome: null,
      };
    }

    const nomeRaw = (args.cliente_nome || "").trim();
    const telefoneNorm = args.cliente_telefone
      ? onlyDigits(args.cliente_telefone)
      : "";

    // Se o usuário digitou o telefone no campo de nome (ex: "11999998888"),
    // evita cadastrar o cliente com o nome sendo o próprio telefone.
    const nomeDigits = onlyDigits(nomeRaw);
    const nomeLooksLikePhone =
      nomeDigits.length >= 10 && nomeDigits.length <= 11 && nomeDigits === telefoneNorm;
    const nome = nomeLooksLikePhone ? "" : nomeRaw;

    if (!telefoneNorm) {
      throw new Error(
        "Para cadastrar um cliente novo, informe o telefone do cliente."
      );
    }

    const { data: found, error: findErr } = await supabase
      .from("clients")
      .select("id, nome, telefone")
      .eq("tenant_id", args.tenantId)
      .eq("telefone", telefoneNorm)
      .maybeSingle();

    if (findErr) {
      console.log("[PEDIDOS] ensureClientId find error:", findErr);
    }

    if (found?.id) {
      const existingNome = String(
        (found as { nome?: unknown } | null | undefined)?.nome || ""
      ).trim();
      return {
        clientId: String(found.id),
        telefoneNorm,
        existed: true,
        clientNome: existingNome || null,
      };
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
          .select("id, nome")
          .eq("tenant_id", args.tenantId)
          .eq("telefone", telefoneNorm)
          .maybeSingle();

        if (found2?.id) {
          const existingNome2 = String(
            (found2 as { nome?: unknown } | null | undefined)?.nome || ""
          ).trim();
          return {
            clientId: String(found2.id),
            telefoneNorm,
            existed: true,
            clientNome: existingNome2 || null,
          };
        }
      }

      console.log("[PEDIDOS] ensureClientId insert error:", insErr);
      throw new Error("Não foi possível cadastrar o cliente automaticamente.");
    }

    if (!inserted?.id) {
      throw new Error("Cliente não retornou ID após cadastro.");
    }

    return {
      clientId: String(inserted.id),
      telefoneNorm,
      existed: false,
      clientNome: nome || "Sem nome",
    };
  };

  const save = async () => {
    if (!ctx) return;

    const dt_entrada = (form.dt_entrada || "").trim();
    if (!dt_entrada) return alert("Preencha a data de entrada.");

    const clientQTrim = (clientQ || "").trim();
    const nomeDigitado = (form.cliente_nome || "").trim();

    const qDigits = onlyDigits(clientQTrim);
    const qLooksLikePhone = qDigits.length >= 10 && qDigits.length <= 11 && !/[a-zA-Z]/.test(clientQTrim);
    const telefoneFromQ = qLooksLikePhone ? qDigits : "";

    // Nome só vem do campo de nome (ou do clientQ quando não for telefone)
    const cliente_nome_input = nomeDigitado || (qLooksLikePhone ? "" : clientQTrim);

    // Para cliente novo: precisa de telefone (ou selecionado via client_id)
    const telefoneProvided = Boolean(onlyDigits(form.cliente_telefone || "") || telefoneFromQ);
    if (!form.client_id && !cliente_nome_input && !telefoneProvided) {
      return alert("Selecione ou digite o cliente (nome ou telefone).");
    }

    const valorBruto = parseBRLToNumber(form.valor);
    if (valorBruto <= 0) return alert("Preencha um valor maior que zero.");

    // ✅ calcula desconto e total final
    const { total } = calcDiscount(
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
      let finalClienteNome: string = cliente_nome_input;

      try {
        const ensured = await ensureClientId({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          cliente_nome: cliente_nome_input,
          cliente_telefone: form.cliente_telefone || telefoneFromQ,
          currentClientId: form.client_id || "",
        });

        finalClientId = ensured.clientId || null;
        finalTelefoneNorm = ensured.telefoneNorm || null;

        if (ensured.existed) {
          const existingNome = ensured.clientNome || "Sem nome";
          const useExisting = confirm(
            `Telefone já cadastrado para o cliente "${existingNome}".\n\nDeseja usar esse cliente?\n\nOK = usar este cliente\nCancelar = inserir um telefone diferente.`
          );

          if (!useExisting) {
            alert(
              "Informe um telefone diferente (ou selecione o cliente existente) para continuar."
            );
            return;
          }

          finalClienteNome = existingNome;
          setClientQ(existingNome);
          setShowClientDropdown(false);

          setForm((s) => ({
            ...s,
            client_id: finalClientId || "",
            cliente_nome: existingNome,
            cliente_telefone: finalTelefoneNorm
              ? maskPhone(finalTelefoneNorm)
              : s.cliente_telefone,
          }));
        } else {
          // Cliente novo (criado agora): usa nome digitado, ou "Sem nome".
          finalClienteNome = finalClienteNome || ensured.clientNome || "Sem nome";
        }

        if (finalClientId && finalClientId !== form.client_id) {
          setForm((s) => ({
            ...s,
            client_id: finalClientId || "",
          }));
        }
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Erro ao garantir cadastro do cliente.");
        return;
      }

      if (!finalClienteNome) {
        return alert("Selecione ou digite o cliente.");
      }

      // ✅ produto (único): resolve/cria/atualiza no catálogo e salva no pedido
      const produtoNomeRaw = String(form.produto || "");
      const produtoNome = produtoNomeRaw.trim();

      const ident = String(productMeta.identificador || "").trim();
      const marca = String(productMeta.marca || "").trim();
      const modelo = String(productMeta.modelo || "").trim();
      const obsProd = String(productMeta.observacao || "").trim();
      const hasDetails = Boolean(ident || marca || modelo || obsProd);

      let primaryProductId: string | null = (form.product_id || "").trim() || null;

      if (produtoNome) {
        if (!primaryProductId) {
          const matched = findProductByName(produtoNome);
          if (matched?.id) primaryProductId = matched.id;
        }

        if (!primaryProductId) {
          const insertProd = {
            tenant_id: ctx.tenantId,
            client_id: finalClientId,
            nome: produtoNome,
            identificador: ident || null,
            marca: marca || null,
            modelo: modelo || null,
            observacao: obsProd || null,
            created_by: ctx.userId,
            updated_by: ctx.userId,
          };

          const { data: createdProd, error: prodErr } = await supabase
            .from("products")
            .insert([insertProd])
            .select("id, nome, client_id, identificador, marca, modelo, observacao")
            .maybeSingle();

          if (prodErr) {
            console.log("[PEDIDOS] create product error:", prodErr);
          } else if (createdProd?.id) {
            primaryProductId = String(createdProd.id);
            const nextProd: ProductMini = {
              id: String(createdProd.id),
              nome: String(createdProd.nome || ""),
              client_id: createdProd.client_id ? String(createdProd.client_id) : null,
              identificador: createdProd.identificador ?? null,
              marca: createdProd.marca ?? null,
              modelo: createdProd.modelo ?? null,
              observacao: createdProd.observacao ?? null,
            };
            setProducts((prev) => [nextProd, ...prev]);
          }
        } else if (hasDetails) {
          const upd = {
            nome: produtoNome,
            client_id: finalClientId,
            identificador: ident || null,
            marca: marca || null,
            modelo: modelo || null,
            observacao: obsProd || null,
            updated_by: ctx.userId,
          };

          const { error: upErr } = await supabase
            .from("products")
            .update(upd)
            .eq("tenant_id", ctx.tenantId)
            .eq("id", primaryProductId);

          if (upErr) {
            console.log("[PEDIDOS] update product error:", upErr);
          }
        }
      } else {
        primaryProductId = null;
      }

      setForm((s) => ({
        ...s,
        product_id: primaryProductId || "",
      }));

      const payload = {
        tenant_id: ctx.tenantId,
        dt_entrada,
        dt_saida: form.dt_saida ? form.dt_saida : null,
        client_id: finalClientId,
        cliente_nome: finalClienteNome,
        cliente_telefone: finalTelefoneNorm,
        item: form.item ? form.item.trim() : null,
        produto: produtoNome ? produtoNome : null,
        product_id: primaryProductId,
        descricao: form.descricao ? form.descricao.trim() : null,
        observacao: form.observacao ? form.observacao.trim() : null,

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
        const { error } = await supabase
          .from("orders")
          .insert([
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

      const savedStatus = form.status as (typeof STATUSES)[number];
      resetForm();
      setFormOpen(false);
      setStatusTab(savedStatus);

      await loadOrders(savedStatus, orderSearchDebounced);
      await loadStatusCounts(orderSearchDebounced);
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
            <div className="font-bold text-lg">Pedidos</div>
            <div className="text-sm text-gray-600">
              {formOpen ? (isEdit ? "Editando pedido" : "Cadastrando novo pedido") : "Cadastro fechado"}
            </div>
            {tenantError && (
              <div className="text-xs text-red-600 mt-1">
                Tenant não carregou: {tenantError}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {!formOpen ? (
              <button
                className="bg-black text-white px-3 py-2 rounded w-full sm:w-auto"
                onClick={openNewOrder}
                disabled={saving}
              >
                Novo Pedido
              </button>
            ) : (
              <button
                className="border px-3 py-2 rounded w-full sm:w-auto"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Fechar
              </button>
            )}
          </div>
        </div>

        {formOpen && (
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

          {/* ✅ PRODUTO + ITEM (mesma linha no desktop) */}
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block min-w-0">
              <div className="text-sm font-medium mb-1">
                Produto {productsLoading ? "(carregando...)" : ""}
              </div>

              <input
                list="product-options"
                className="border rounded px-3 py-2 w-full max-w-full min-w-0"
                value={form.produto}
                onChange={(e) => {
                  const v = e.target.value;

                  const key = normalizeName(v);
                  const matched = products.find(
                    (p) => normalizeName(p.nome) === key
                  );

                  setForm((s) => ({
                    ...s,
                    produto: v,
                    product_id: matched?.id ? String(matched.id) : "",
                  }));
                }}
                placeholder={
                  form.client_id
                    ? "Ex: Máquina / Produto"
                    : "Selecione um cliente primeiro"
                }
              />

              <datalist id="product-options">
                {products.map((p) => (
                  <option key={p.id} value={p.nome} />
                ))}
              </datalist>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {form.client_id
                    ? "Ao salvar, produtos novos entram no catálogo do cliente."
                    : "Selecione um cliente para ver os produtos cadastrados."}
                </div>

                <button
                  type="button"
                  className="text-xs underline text-slate-700"
                  onClick={() => setProductDetailsOpen((v) => !v)}
                >
                  {productDetailsOpen ? "Ocultar detalhes" : "Detalhar produto"}
                </button>
              </div>

              {productDetailsOpen ? (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field
                    label="Identificador"
                    value={productMeta.identificador}
                    onChange={(v) => setProductMeta((s) => ({ ...s, identificador: v }))}
                    placeholder="Ex: SN, IMEI, Placa, Código"
                  />

                  <Field
                    label="Marca"
                    value={productMeta.marca}
                    onChange={(v) => setProductMeta((s) => ({ ...s, marca: v }))}
                    placeholder="Ex: Bosch"
                  />

                  <Field
                    label="Modelo"
                    value={productMeta.modelo}
                    onChange={(v) => setProductMeta((s) => ({ ...s, modelo: v }))}
                    placeholder="Ex: X123"
                  />

                  <label className="block min-w-0">
                    <div className="text-sm font-medium mb-1">Observação (produto)</div>
                    <input
                      className="border rounded px-3 py-2 w-full max-w-full min-w-0"
                      value={productMeta.observacao}
                      onChange={(e) => setProductMeta((s) => ({ ...s, observacao: e.target.value }))}
                      placeholder="Ex: Cor, voltagem, condição"
                    />
                  </label>
                </div>
              ) : null}
            </label>

            <Field
              label="Item"
              value={form.item}
              onChange={(v) => setForm((s) => ({ ...s, item: v }))}
              placeholder="Ex: Serviço"
            />
          </div>

          {/* ✅ DESCONTO + VALOR DO DESCONTO + SUBTOTAL (mesma linha no desktop) */}
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3">
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

            <Field
              label="Valor (subtotal) *"
              value={form.valor}
              onChange={(v) => setForm((s) => ({ ...s, valor: maskBRL(v) }))}
              placeholder="0,00"
            />
          </div>

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
              className="border rounded px-3 py-2 w-full min-h-55"
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

          <label className="block md:col-span-3">
            <div className="text-sm font-medium mb-1">Observação</div>
            <textarea
              className="border rounded px-3 py-2 w-full min-h-28"
              value={form.observacao}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  observacao: e.target.value,
                }))
              }
              placeholder="Ex: Garantia de 90 dias. Retirar até sexta. Peça encomendada."
            />
          </label>
          </div>
        )}

        {formOpen && (
          <div className="mt-3 flex flex-col sm:flex-row gap-2 justify-start">
            <button
              className="bg-black text-white px-3 py-2 rounded w-full sm:w-auto"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Salvando..." : isEdit ? "Atualizar" : "Salvar"}
            </button>

            {isEdit && (
              <button
                className="border px-3 py-2 rounded w-full sm:w-auto"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
                disabled={saving}
              >
                Cancelar edição
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border rounded p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <div className="font-bold text-lg">Lista de Pedidos</div>
            {orderSearchDebounced ? (
              <div className="text-xs text-slate-600">
                Filtrando por: <b>{orderSearchDebounced}</b>
              </div>
            ) : (
              <div className="text-xs text-slate-600">Selecione um status e gerencie seus pedidos.</div>
            )}
          </div>

          <div className="w-full sm:w-80">
            <div className="flex gap-2">
              <input
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Pesquisar pedidos (cliente, produto, item, telefone, descrição, observação...)"
                className="border rounded px-3 py-2 w-full"
              />
              {orderSearch && (
                <button
                  type="button"
                  onClick={() => setOrderSearch("")}
                  className="border px-3 py-2 rounded hover:bg-gray-50"
                  title="Limpar"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

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
                  <th className="border px-3 py-2">Produto</th>
                  <th className="border px-3 py-2">Total</th>
                  <th className="border px-3 py-2">Status</th>
                  <th className="border px-3 py-2">Ações</th>
                </tr>
              </thead>

              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border px-3 py-3 text-gray-600">
                      {orderSearchDebounced
                        ? "Nenhum pedido encontrado para sua pesquisa."
                        : "Nenhum pedido neste status."}
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

                      <td className="border px-3 py-2">
                        <div className="font-medium">{o.produto || o.item || ""}</div>
                        {o.produto && o.item ? (
                          <div className="text-xs text-slate-600">{o.item}</div>
                        ) : null}
                      </td>

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
          isOpen={previewOpen}
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
  value: string | number | null | undefined;
  onChange: (v: string) => void;
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
  isOpen: boolean;
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



  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const toDataURLFromImageUrl = useCallback(async (url: string) => {
    const res = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao baixar logo: ${res.status}`);
    const blob = await res.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  const tryLoadLogoDataUrl = useCallback(
    async (logoUrl: string): Promise<string | null> => {
      try {
        return await toDataURLFromImageUrl(logoUrl);
      } catch (e) {
        console.log("[PEDIDOS] direct logo fetch failed, trying proxy...", e);
      }

      try {
        const proxied = `/api/image-proxy?url=${encodeURIComponent(logoUrl)}`;
        return await toDataURLFromImageUrl(proxied);
      } catch (e) {
        console.log("[PEDIDOS] proxy logo fetch failed:", e);
        return null;
      }
    },
    [toDataURLFromImageUrl]
  );

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLogoDataUrl(null);

      const url = props.tenant?.logo_url;
      if (!url) return;

      try {
        const dataUrl = await tryLoadLogoDataUrl(url);
        if (alive && dataUrl) setLogoDataUrl(dataUrl);
      } catch (e) {
        console.log("[PEDIDOS] logo to dataurl failed:", e);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [props.tenant?.logo_url, props.order.id, tryLoadLogoDataUrl]);



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

  const buildPngPages = async (): Promise<
    { pages: { dataUrl: string; fileName: string }[] } | null
  > => {
    if (!previewRef.current) return null;

    const node = previewRef.current;

    // ✅ Garante que a logo esteja embutida em DataURL antes do snapshot.
    // Isso evita sumir no PNG/WhatsApp no mobile (CORS/canvas taint/timing).
    const logoUrl = props.tenant?.logo_url;
    const logoImg = node.querySelector(
      'img[data-role="tenant-logo"]'
    ) as HTMLImageElement | null;

    let revertLogoSrc: string | null = null;
    try {
      if (logoUrl && logoImg) {
        const currentSrc = logoImg.getAttribute("src") || "";
        const isDataUrl = currentSrc.startsWith("data:");

        if (!isDataUrl) {
          const dataUrl = logoDataUrl || (await tryLoadLogoDataUrl(logoUrl));
          if (dataUrl) {
            revertLogoSrc = currentSrc;
            logoImg.src = dataUrl;
            // mantém o estado em sync pro preview ficar consistente
            setLogoDataUrl((prev) => prev || dataUrl);

            if (!(logoImg.complete && logoImg.naturalWidth > 0)) {
              await new Promise<void>((resolve) => {
                const done = () => resolve();
                logoImg.addEventListener("load", done, { once: true });
                logoImg.addEventListener("error", done, { once: true });
              });
            }
          }
        }
      }

    const imgs = Array.from(node.querySelectorAll("img")) as HTMLImageElement[];

    // ✅ aguarda todas as imagens carregarem (ou falharem) antes de gerar o canvas
    await Promise.all(
      imgs.map((img) => {
        // pula imagens sem src
        if (!img.src) return Promise.resolve();

        // se já carregou (e tem dimensão), ok
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();

        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      })
    );

    // ✅ 2 frames: resolve bugs de layout no mobile (principalmente Safari)
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const pixelRatio = 2; // nítido sem ficar gigante
    const canvas = await toCanvas(node, {
      cacheBust: true,
      pixelRatio,
      backgroundColor: "#ffffff",
      style: { transform: "scale(1)", transformOrigin: "top left" },
    });

    const base = `pedido-${
      props.order.dt_entrada || new Date().toISOString().slice(0, 10)
    }`;

    const pageHeight = Math.round(A4_H * pixelRatio);
    const pages: { dataUrl: string; fileName: string }[] = [];

    let pageIndex = 1;
    for (let y = 0; y < canvas.height; y += pageHeight) {
      const sliceH = Math.min(pageHeight, canvas.height - y);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;

      const ctx2 = pageCanvas.getContext("2d");
      if (!ctx2) continue;

      ctx2.drawImage(
        canvas,
        0,
        y,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH
      );

      const dataUrl = pageCanvas.toDataURL("image/png");

      const fileName =
        pages.length === 0 && canvas.height <= pageHeight
          ? `${base}.png`
          : `${base}-p${pageIndex}.png`;

      pages.push({ dataUrl, fileName });
      pageIndex++;
    }

    return { pages };
    } finally {
      if (logoImg && revertLogoSrc) {
        logoImg.src = revertLogoSrc;
      }
    }
  };

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // A4 em px (aprox em 96dpi). O pixelRatio abaixo deixa bem nítido.
  const A4_W = 794;  // 210mm
  const A4_H = 1123; // 297mm
  const PAPER_W = A4_W;


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
  }, [PAPER_W]);


    const shareImage = async () => {
    setSharingImg(true);
    try {
      const built = await buildPngPages();
      if (!built) return;

      const files = built.pages.map((p) => dataUrlToFile(p.dataUrl, p.fileName));

      const navAny = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data: ShareData) => boolean;
      };

      const canShareFiles =
        typeof navAny.share === "function" &&
        typeof navAny.canShare === "function" &&
        navAny.canShare({ files }) === true;

      if (canShareFiles) {
        await navAny.share({
          title: "Pedido",
          text:
            files.length > 1
              ? "Segue o pedido em imagens (páginas A4)."
              : "Segue o pedido em imagem.",
          files,
        });
      } else {
        // fallback: baixa todas as páginas
        for (const p of built.pages) downloadDataUrl(p.dataUrl, p.fileName);
        alert(
          "Seu navegador não suportou compartilhar arquivos. Fiz o download das páginas em PNG."
        );
      }
    } catch (err: unknown) {
      console.log("[PEDIDOS] share image error:", err);
      alert("Não foi possível gerar a imagem. Veja o console para detalhes.");
    } finally {
      setSharingImg(false);
    }
  };


    const downloadImage = async () => {
    setDownloadingImg(true);
    try {
      const built = await buildPngPages();
      if (!built) return;

      for (const p of built.pages) {
        downloadDataUrl(p.dataUrl, p.fileName);
      }
    } catch (err: unknown) {
      console.log("[PEDIDOS] download image error:", err);
      alert("Não foi possível baixar a imagem. Veja o console para detalhes.");
    } finally {
      setDownloadingImg(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg w-5xl shadow-lg overflow-hidden">
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
                  className="rounded-lg bg-white text-slate-900 border border-slate-300"
                  style={{
                    width: PAPER_W,
                    minHeight: A4_H,
                    padding: 32,
                    boxSizing: "border-box",
                  }}
                >

                  <div className="text-[15px] leading-[1.45]">
                    {props.tenantLoading ? (
                      <div className="text-gray-600">
                        Carregando dados da empresa...
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-6">
                          <div className="min-w-0">
                            <div className="text-[22px] font-extrabold tracking-tight leading-tight">
                              {props.tenant?.name || ""}
                            </div>

                            <div className="mt-2 text-slate-700 space-y-1">
                              <div className="flex flex-wrap gap-x-6 gap-y-1">
                                <div>
                                  <span className="font-semibold">CNPJ:</span> {props.tenant?.cnpj || ""}
                                </div>
                                <div>
                                  <span className="font-semibold">IE:</span> {props.tenant?.ie || ""}
                                </div>
                              </div>

                              <div className="truncate">
                                <span className="font-semibold">Endereço:</span> {props.tenant?.endereco || ""}
                              </div>

                              <div>
                                <span className="font-semibold">Fone:</span>{" "}
                                {props.tenant?.phone ? maskPhone(props.tenant.phone) : ""}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex flex-col items-end gap-3">
                            {props.tenant?.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={logoDataUrl || props.tenant.logo_url}
                                alt="Logo da empresa"
                                className="h-18 w-45 object-contain"
                                crossOrigin="anonymous"
                                data-role="tenant-logo"
                              />
                            ) : null}

                            <div className="text-right">
                              <div className="text-[12px] uppercase tracking-wide text-slate-500">
                                Pedido
                              </div>
                              <div className="text-[16px] font-bold leading-tight">
                                {props.order.dt_entrada || ""}
                              </div>
                              <div className="mt-1 inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-[13px] font-semibold text-slate-700">
                                {props.order.status || ""}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="my-5 border-t border-slate-200" />

                  <div className="text-center">
                    <div className="text-[13px] uppercase tracking-wide text-slate-500">
                      Produto / Serviço
                    </div>

                    <div className="mt-1 font-extrabold text-[22px] leading-tight">
                      {props.order.produto || props.order.item || ""}
                    </div>

                    {props.order.produto && props.order.item ? (
                      <div className="mt-1 text-[15px] text-slate-700">
                        {props.order.item}
                      </div>
                    ) : null}
                  </div>

                  <div className="my-5 border-t border-slate-200" />

                  <div className="grid grid-cols-2 gap-4 text-[15px] leading-[1.45]">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[12px] uppercase tracking-wide text-slate-500">
                        Cliente
                      </div>
                      <div className="mt-1 font-bold text-[16px]">
                        {props.order.cliente_nome || ""}
                      </div>
                      <div className="mt-1 text-slate-700">
                        <span className="font-semibold">Fone:</span>{" "}
                        {props.order.cliente_telefone
                          ? maskPhone(props.order.cliente_telefone)
                          : ""}
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[12px] uppercase tracking-wide text-slate-500">
                        Informações
                      </div>
                      <div className="mt-1 text-slate-700">
                        <span className="font-semibold">Data:</span> {props.order.dt_entrada || ""}
                      </div>
                      <div className="mt-1 text-slate-700">
                        <span className="font-semibold">Status:</span> {props.order.status || ""}
                      </div>
                    </div>
                  </div>

                  {props.order.observacao ? (
                    <>
                      <div className="my-5 border-t border-slate-200" />
                      <div className="rounded-md border-2 border-dashed border-slate-400 bg-white p-3 text-[15px] leading-[1.45]">
                        <div className="text-[12px] uppercase tracking-wide text-slate-500">
                          Observação
                        </div>
                        <div className="mt-1 text-slate-800 whitespace-pre-wrap">
                          {props.order.observacao}
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="my-5 border-t border-slate-200" />

                  <div className="overflow-auto">
                    <table className="min-w-full border border-slate-300 text-[15px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="border-b border-slate-300 px-3 py-2 w-20 text-left font-semibold text-slate-700">
                            Item
                          </th>
                          <th className="border-b border-slate-300 px-3 py-2 text-left font-semibold text-slate-700">
                            Descrição
                          </th>
                          <th className="border-b border-slate-300 px-3 py-2 w-40 text-right font-semibold text-slate-700">
                            Valor
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {itens.length === 0 ? (
                          <tr>
                            <td className="px-3 py-2">1</td>
                            <td className="px-3 py-2 text-slate-600">—</td>
                            <td className="px-3 py-2 text-right">
                              {formatBRLFromNumber(subtotal)}
                            </td>
                          </tr>
                        ) : (
                          itens.map((it) => (
                            <tr key={it.n}>
                              <td className="px-3 py-2">{it.n}</td>
                              <td className="px-3 py-2 wrap-break-word">{it.desc}</td>
                              <td className="px-3 py-2 text-right">
                                {formatBRLFromNumber(it.value)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ✅ TOTAIS */}
                  <div className="mt-5 flex items-end justify-end">
                    <div className="w-[320px] rounded-md border border-slate-200 bg-slate-50 p-3 text-[13px]">
                      {discount > 0 ? (
                        <>
                          <div className="flex items-center justify-between text-slate-700">
                            <div className="font-semibold">
                              Desconto{discountType === "percent" ? ` (${props.order.desconto_valor ?? 0}%)` : ""}
                            </div>
                            <div className="font-semibold">-{formatBRLFromNumber(discount)}</div>
                          </div>

                          <div className="mt-1 flex items-center justify-between">
                            <div className="font-semibold text-slate-700">Subtotal</div>
                            <div className="font-semibold">{formatBRLFromNumber(subtotal)}</div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-slate-700">Subtotal</div>
                          <div className="font-semibold">{formatBRLFromNumber(subtotal)}</div>
                        </div>
                      )}

                      <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between">
                        <div className="text-[13px] uppercase tracking-wide text-slate-500">
                          Total
                        </div>
                        <div className="text-[24px] font-extrabold">
                          {formatBRLFromNumber(totalFinal)}
                        </div>
                      </div>
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
