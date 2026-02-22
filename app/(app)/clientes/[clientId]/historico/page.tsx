"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { PreviewModal, buildShareText } from "@/components/PedidosPanel";

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

type OrderMini = {
  id: string;
  created_at: string;
  dt_entrada: string;
  produto: string | null;
  item: string | null;
  valor: number;
  status: string;
};

const STATUSES = [
  "aberto",
  "orçamento",
  "aguardando retirada",
  "a receber",
  "pago",
  "arquivado",
] as const;

const onlyDigits = (v: string) => String(v || "").replace(/\D+/g, "");

const digitsToLooseIlike = (digits: string) => {
  const d = onlyDigits(digits);
  if (!d) return "";
  // Ex: 11999999999 -> %1%1%9%9%9%9%9%9%9%9%9%
  return `%${d.split("").join("%")}%`;
};

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

export default function ClienteHistoricoPage({
}: Record<string, never>) {
  const routeParams = useParams<{ clientId?: string | string[] }>();
  const clientId = useMemo(() => {
    const raw = routeParams?.clientId;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v || "").trim();
  }, [routeParams?.clientId]);

  const [ctx, setCtx] = useState<TenantCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderMini[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | (typeof STATUSES)[number]>("");
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [clientName, setClientName] = useState<string>("");
  const [clientPhoneRaw, setClientPhoneRaw] = useState<string>("");
  const [clientPhoneDigits, setClientPhoneDigits] = useState<string>("");

  const canLoad = useMemo(() => Boolean(ctx?.tenantId && clientId), [ctx, clientId]);

  const visibleRows = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter(
      (r) => String(r.status || "").trim().toLowerCase() === String(statusFilter)
    );
  }, [rows, statusFilter]);

  useEffect(() => {
    let alive = true;

    const loadCtx = async () => {
      setCtxLoading(true);
      setErrorMsg(null);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
          setErrorMsg("Sessão inválida. Faça login novamente.");
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
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
          setErrorMsg(
            "Seu usuário não está vinculado a uma empresa (tenant). Verifique a tabela profiles."
          );
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
    let alive = true;

    const loadTenant = async () => {
      if (!ctx?.tenantId) return;
      setTenantLoading(true);

      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, cnpj, ie, endereco, phone, logo_url")
        .eq("id", ctx.tenantId)
        .maybeSingle();

      if (!alive) return;
      setTenantLoading(false);

      if (error) {
        console.log("[HISTORICO] load tenant error:", error);
        setTenantInfo(null);
        return;
      }

      setTenantInfo((data || null) as TenantInfo | null);
    };

    loadTenant();
    return () => {
      alive = false;
    };
  }, [ctx?.tenantId]);

  useEffect(() => {
    let alive = true;

    const loadClientInfo = async () => {
      if (!ctx?.tenantId || !clientId) return;

      const { data, error } = await supabase
        .from("clients")
        .select("telefone, nome")
        .eq("id", clientId)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.log("[HISTORICO] load client phone error:", error);
        setClientName("");
        setClientPhoneRaw("");
        setClientPhoneDigits("");
        return;
      }

      const raw = String((data as { telefone?: string; nome?: string } | null)?.telefone || "");
      const nome = String((data as { telefone?: string; nome?: string } | null)?.nome || "").trim();
      const digits = onlyDigits(raw);

      setClientName(nome);
      setClientPhoneRaw(raw);
      setClientPhoneDigits(digits);
    };

    loadClientInfo();
    return () => {
      alive = false;
    };
  }, [ctx?.tenantId, clientId]);

  const openPreviewById = useCallback(
    async (orderId: string) => {
      if (!ctx?.tenantId) return;

      setPreviewLoading(true);

      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, created_at, dt_entrada, dt_saida, client_id, cliente_nome, cliente_telefone, item, produto, product_id, descricao, observacao, valor, valor_bruto, desconto_tipo, desconto_valor, status"
        )
        .eq("tenant_id", ctx.tenantId)
        .eq("id", orderId)
        .maybeSingle();

      setPreviewLoading(false);

      if (error || !data) {
        console.log("[HISTORICO] load order for preview error:", error);
        alert("Não foi possível carregar o pedido para visualizar.");
        return;
      }

      setPreviewOrder(data as any);
      setPreviewOpen(true);
    },
    [ctx?.tenantId]
  );

  useEffect(() => {
    let alive = true;

    const loadOrders = async () => {
      if (!canLoad) return;

      setLoading(true);
      setErrorMsg(null);

      let q = supabase
        .from("orders")
        .select("id, created_at, dt_entrada, produto, item, valor, status")
        .eq("tenant_id", ctx!.tenantId);

      // ✅ Compatibilidade: alguns pedidos antigos podem não ter client_id salvo,
      // mas têm cliente_telefone. Então procuramos por client_id OU telefone.
      const ors: string[] = [`client_id.eq.${clientId}`];

      const raw = String(clientPhoneRaw || "").trim();
      if (raw) {
        ors.push(`cliente_telefone.eq.${raw}`);
        ors.push(`cliente_telefone.ilike.%${raw}%`);
      }

      const phoneDigits = onlyDigits(clientPhoneDigits);
      if (phoneDigits) {
        const loose = digitsToLooseIlike(phoneDigits);
        ors.push(`cliente_telefone.eq.${phoneDigits}`);
        // Match quando o telefone está guardado com caracteres no meio.
        if (loose) ors.push(`cliente_telefone.ilike.${loose}`);
      }

      q = q.or(ors.join(","));

      const { data, error } = await q
        .order("dt_entrada", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (!alive) return;
      setLoading(false);

      if (error) {
        console.log("[HISTORICO] load orders error:", error);
        setRows([]);
        setErrorMsg("Erro ao carregar pedidos: " + error.message);
        return;
      }

      setRows((data || []) as OrderMini[]);
    };

    loadOrders();
    return () => {
      alive = false;
    };
  }, [canLoad, clientId, ctx?.tenantId, clientPhoneRaw, clientPhoneDigits]);

  return (
    <main className="min-h-screen px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="font-bold text-lg">
            Histórico de pedidos
            {clientName ? (
              <span className="font-normal text-slate-600"> — {clientName}</span>
            ) : null}
          </div>
        </div>

        <Link href="/" className="border px-3 py-2 rounded">
          Voltar
        </Link>
      </div>

      {ctxLoading ? (
        <div className="text-sm text-slate-600">Carregando...</div>
      ) : errorMsg ? (
        <div className="border rounded p-3 bg-slate-50 text-sm text-slate-700">
          {errorMsg}
        </div>
      ) : (
        <div className="border rounded p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="text-sm text-slate-600">
              {loading
                ? "Carregando pedidos..."
                : `Mostrando ${visibleRows.length} pedido(s).`}
            </div>

            <div className="flex items-center gap-2">
              <div className="text-sm text-slate-600">Status</div>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    (e.target.value || "") as "" | (typeof STATUSES)[number]
                  )
                }
                title="Filtrar por status"
                disabled={loading}
              >
                <option value="">Todos</option>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="border px-3 py-2 w-36">Data do pedido</th>
                  <th className="border px-3 py-2">Produto</th>
                  <th className="border px-3 py-2">Serviço</th>
                  <th className="border px-3 py-2 w-40">Status</th>
                  <th className="border px-3 py-2 w-40 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td className="border px-3 py-3 text-slate-600" colSpan={5}>
                      Nenhum pedido encontrado para este cliente.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="border px-3 py-2">{o.dt_entrada || ""}</td>
                      <td className="border px-3 py-2">{o.produto || ""}</td>
                      <td className="border px-3 py-2">{o.item || ""}</td>
                      <td className="border px-3 py-2">{o.status || ""}</td>
                      <td className="border px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span>{formatBRLFromNumber(Number(o.valor) || 0)}</span>
                          <button
                            className="border px-2 py-1 rounded inline-flex items-center gap-1"
                            onClick={() => openPreviewById(o.id)}
                            title="Visualizar"
                            type="button"
                            disabled={previewLoading}
                          >
                            <Eye size={16} />
                            Visualizar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {previewOpen && previewOrder && (
        <PreviewModal
          isOpen={previewOpen}
          tenant={tenantInfo as any}
          tenantLoading={tenantLoading}
          order={previewOrder as any}
          onClose={() => setPreviewOpen(false)}
          onShare={async () => {
            const text = buildShareText(previewOrder as any, tenantInfo as any);
            await navigator.clipboard.writeText(text);
            alert("Texto copiado! Cole no WhatsApp.");
          }}
        />
      )}
    </main>
  );
}
