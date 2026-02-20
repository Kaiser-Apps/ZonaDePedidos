import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sistema de Pedidos Grátis Online",
  description:
    "Controle pedidos, cadastros e orçamentos em um sistema gratuito e online. Ideal para pequenas empresas e MEI.",
  alternates: {
    canonical: "/sistema-de-pedidos-gratis",
  },
  keywords: [
    "sistema de pedidos grátis",
    "controle de pedidos grátis",
    "gestão de pedidos grátis",
    "cadastro de pedidos grátis",
    "sistema gratuito de pedidos online",
    "software de pedidos gratuito",
    "gerenciador de pedidos grátis",
    "sistema de pedidos grátis para MEI",
    "sistema de pedidos grátis para pequenas empresas",
  ],
};

export default function SistemaDePedidosGratisPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Zona de Pedidos",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Sistema de pedidos grátis online para controlar pedidos e orçamentos, com cadastro de clientes e gestão simples.",
  };

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Zona de Pedidos</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Sistema de Pedidos Grátis Online
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
          Se você busca um <strong>sistema de pedidos grátis</strong> para organizar
          sua rotina, o Zona de Pedidos ajuda a fazer <strong>cadastro de pedidos grátis</strong>,
          acompanhar status e manter <strong>controle de pedidos grátis</strong> de forma
          simples. Também dá para usar como <strong>sistema de orçamento grátis</strong>
          quando você marca um pedido como “orçamento”.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">O que você consegue controlar</h2>
          <ul className="mt-4 list-disc pl-5 text-slate-700 space-y-2">
            <li>
              <strong>Pedidos e orçamentos</strong> com status (ex.: aberto, orçamento,
              aguardando retirada, pago).
            </li>
            <li>
              <strong>Clientes</strong> com dados essenciais para contato e histórico.
            </li>
            <li>
              <strong>Valores</strong> com desconto (percentual ou em valor) e total
              final.
            </li>
            <li>
              <strong>Compartilhar</strong> detalhes do pedido/orçamento com o cliente
              (ex.: copiar/gerar imagem para enviar).
            </li>
          </ul>
        </div>

        <h2 className="mt-10 text-xl font-bold">
          Para quem é este sistema gratuito de pedidos online
        </h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Ideal para pequenas empresas, assistência técnica, prestadores de serviço e
          para quem quer um <strong>software de pedidos gratuito</strong> que funcione
          direto no navegador. Se você é MEI, esta página também cobre o que muita gente
          procura como “<strong>sistema de pedidos grátis para MEI</strong>”.
        </p>

        <h2 className="mt-10 text-xl font-bold">Variações de busca (semântica)</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          O Google entende sinônimos. Esta página também atende buscas como:
          “<strong>programa de pedidos grátis</strong>”, “<strong>aplicativo de pedidos grátis</strong>”,
          “<strong>gerenciador de pedidos grátis</strong>” e “<strong>sistema de controle de pedidos online grátis</strong>”.
        </p>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Perguntas frequentes</h2>
          <div className="mt-4 space-y-4 text-slate-700">
            <div>
              <h3 className="font-semibold">
                Como controlar pedidos online grátis sem planilha?
              </h3>
              <p className="mt-1 leading-relaxed">
                Você cadastra o cliente, cria o pedido e acompanha o status. Isso vira
                uma rotina de <strong>gestão de pedidos grátis</strong> sem depender de
                arquivos soltos.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">
                Dá para usar como sistema de orçamento online grátis?
              </h3>
              <p className="mt-1 leading-relaxed">
                Sim. Ao marcar o status como “orçamento”, você consegue organizar e
                compartilhar o orçamento com o cliente.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">
                Serve para pequenas empresas e MEI?
              </h3>
              <p className="mt-1 leading-relaxed">
                Sim — o foco é simplificar: menos burocracia e mais clareza para você
                acompanhar pedidos, valores e clientes.
              </p>
            </div>
          </div>
        </div>

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
            href="/controle-de-pedidos-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver controle de pedidos grátis
          </Link>
        </div>
      </div>
    </main>
  );
}
