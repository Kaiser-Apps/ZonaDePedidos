import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sistema de Pedidos Grátis para MEI",
  description:
    "Sistema de pedidos grátis para MEI e pequenas empresas: controle de pedidos e orçamentos, clientes e status em um gerenciador online simples.",
  alternates: {
    canonical: "/para-mei",
  },
  keywords: [
    "sistema de pedidos grátis para MEI",
    "sistema de pedidos grátis para pequenas empresas",
    "sistema de orçamento grátis para autônomos",
    "ferramenta grátis para controle de vendas e pedidos",
  ],
};

export default function ParaMeiPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Zona de Pedidos</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Sistema de Pedidos Grátis para MEI
            </h1>
          </div>
          <div className="shrink-0 flex gap-2">
            <Link
              href="/cadastro"
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Criar conta grátis
            </Link>
            <Link
              href="/login"
              className="border border-slate-200 bg-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Entrar
            </Link>
          </div>
        </div>

        <p className="mt-6 text-slate-700 leading-relaxed">
          Para MEI, tempo é dinheiro. Um <strong>sistema de pedidos grátis para MEI</strong>
          ajuda a organizar atendimento, acompanhar pendências e manter histórico de
          orçamento e pedido sem depender de planilha.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">O que costuma dar certo para MEI</h2>
          <ul className="mt-4 list-disc pl-5 text-slate-700 space-y-2">
            <li>Padronizar status e etapas (do orçamento ao pago).</li>
            <li>Centralizar clientes e contatos (para não perder histórico).</li>
            <li>Ter um lugar único para valores e descrições do que foi combinado.</li>
            <li>Compartilhar orçamento/pedido com rapidez quando o cliente pedir.</li>
          </ul>
        </div>

        <h2 className="mt-10 text-xl font-bold">Long tail estratégica</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Buscas como “<strong>sistema de pedidos grátis para pequenas empresas</strong>”
          e “<strong>sistema de orçamento grátis para autônomos</strong>” tendem a ter
          menos concorrência e conversão mais alta. Por isso, esta página existe.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/cadastro"
            className="bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Criar conta grátis
          </Link>
          <Link
            href="/sistema-de-pedidos-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver sistema de pedidos grátis
          </Link>
          <Link
            href="/sistema-de-orcamento-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver sistema de orçamento grátis
          </Link>
        </div>
      </div>
    </main>
  );
}
