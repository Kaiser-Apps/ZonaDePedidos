import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Criar Orçamento Grátis",
  description:
    "Aprenda como criar orçamento online grátis e organizar seus orçamentos por status. Compartilhe com clientes de forma simples.",
  alternates: {
    canonical: "/criar-orcamento-gratis",
  },
  keywords: [
    "criar orçamento grátis",
    "criar orçamento online grátis",
    "como fazer orçamento online grátis",
    "ferramenta grátis para criar orçamentos",
  ],
};

export default function CriarOrcamentoGratisPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Zona de Pedidos</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Criar Orçamento Grátis
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
          Se a sua dúvida é <strong>como fazer orçamento online grátis</strong>, comece
          pelo básico: cliente, descrição do serviço/produto, valor e status. O Zona de
          Pedidos permite marcar um registro como “orçamento” para você ter histórico,
          acompanhar respostas e depois converter em pedido.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Passo a passo</h2>
          <ol className="mt-4 list-decimal pl-5 text-slate-700 space-y-2">
            <li>Crie sua conta.</li>
            <li>Cadastre o cliente.</li>
            <li>Crie um pedido e selecione o status “orçamento”.</li>
            <li>Preencha a descrição e o valor (e desconto, se quiser).</li>
            <li>Compartilhe com o cliente e acompanhe.</li>
          </ol>
        </div>

        <h2 className="mt-10 text-xl font-bold">
          Para prestadores de serviço e autônomos
        </h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Quem presta serviço geralmente precisa de agilidade. Uma <strong>ferramenta grátis para criar orçamentos</strong>
          ajuda a padronizar o que você envia e dá mais clareza para o cliente.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/cadastro"
            className="bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Criar conta grátis
          </Link>
          <Link
            href="/sistema-de-orcamento-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver sistema de orçamento grátis
          </Link>
          <Link
            href="/sistema-de-pedidos-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver sistema de pedidos grátis
          </Link>
        </div>
      </div>
    </main>
  );
}
