import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gestão de Pedidos Grátis",
  description:
    "Gestão de pedidos grátis com organização por status, clientes e valores. Um gerenciador online simples para MEI e pequenas empresas.",
  alternates: {
    canonical: "/gestao-de-pedidos-gratis",
  },
  keywords: [
    "gestão de pedidos grátis",
    "gerenciador de pedidos grátis",
    "software gratuito para gestão de pedidos",
    "sistema de pedidos grátis para pequenas empresas",
  ],
};

export default function GestaoDePedidosGratisPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Zona de Pedidos</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Gestão de Pedidos Grátis
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
          Fazer <strong>gestão de pedidos grátis</strong> é mais do que “anotar pedidos”.
          É ter clareza de etapas, valores, clientes e pendências — e manter tudo acessível
          para você (e sua equipe) em um fluxo simples.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Por que um gerenciador ajuda</h2>
          <ul className="mt-4 list-disc pl-5 text-slate-700 space-y-2">
            <li>Evita perder pedidos em conversas e anotações.</li>
            <li>Facilita saber o que está “em aberto” e o que já foi finalizado.</li>
            <li>Deixa mais simples oferecer orçamento e converter em pedido.</li>
            <li>Centraliza clientes e histórico de atendimento.</li>
          </ul>
        </div>

        <h2 className="mt-10 text-xl font-bold">Busca com intenção alta</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Pessoas que procuram “<strong>software gratuito para gestão de pedidos</strong>”
          ou “<strong>gerenciador de pedidos grátis</strong>” normalmente já querem aplicar
          isso no dia a dia. Por isso, este tipo de página costuma converter bem.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/cadastro"
            className="bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Criar conta grátis
          </Link>
          <Link
            href="/controle-de-pedidos-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver controle de pedidos grátis
          </Link>
          <Link
            href="/para-mei"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver para MEI
          </Link>
        </div>
      </div>
    </main>
  );
}
