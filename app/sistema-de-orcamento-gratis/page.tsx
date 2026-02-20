import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sistema de Orçamento Grátis",
  description:
    "Crie orçamento online grátis, organize seus orçamentos por status e compartilhe com clientes. Ideal para MEI e pequenas empresas.",
  alternates: {
    canonical: "/sistema-de-orcamento-gratis",
  },
  keywords: [
    "sistema de orçamento grátis",
    "sistema de orçamento online grátis",
    "gerador de orçamento grátis",
    "criar orçamento online grátis",
    "modelo de orçamento grátis",
    "software de orçamento gratuito",
    "ferramenta para fazer orçamento grátis",
  ],
};

export default function SistemaDeOrcamentoGratisPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Sistema de Orçamento Grátis | Zona de Pedidos",
    description:
      "Sistema de orçamento grátis para criar orçamento online, organizar por status e compartilhar com clientes.",
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
              Sistema de Orçamento Grátis
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
          Precisa de um <strong>sistema de orçamento grátis</strong> para enviar valores
          com mais profissionalismo? No Zona de Pedidos, você consegue <strong>criar orçamento online grátis</strong>
          usando o status “orçamento”, organizar por etapas e compartilhar com seu cliente.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Como fazer orçamento online grátis</h2>
          <ol className="mt-4 list-decimal pl-5 text-slate-700 space-y-2">
            <li>Cadastre o cliente (nome e telefone).</li>
            <li>Crie um pedido e selecione o status “orçamento”.</li>
            <li>Informe descrição, observações e valores (com desconto, se quiser).</li>
            <li>Compartilhe o orçamento com o cliente (ex.: copiar/gerar imagem).</li>
          </ol>
        </div>

        <h2 className="mt-10 text-xl font-bold">Variações que o Google entende</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Além de “sistema de orçamento grátis”, esta página também cobre buscas como
          “<strong>sistema de orçamento online grátis</strong>”, “<strong>gerador de orçamento grátis</strong>”
          e “<strong>ferramenta para fazer orçamento grátis</strong>”.
        </p>

        <h2 className="mt-10 text-xl font-bold">Para MEI e prestadores de serviço</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Se você é autônomo, MEI ou tem uma pequena empresa, um <strong>software de orçamento gratuito</strong>
          pode ajudar a padronizar o atendimento e evitar “orçamentos perdidos” em mensagens.
          Você mantém o histórico e consegue retomar conversas com mais agilidade.
        </p>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Perguntas frequentes</h2>
          <div className="mt-4 space-y-4 text-slate-700">
            <div>
              <h3 className="font-semibold">O orçamento vira pedido depois?</h3>
              <p className="mt-1 leading-relaxed">
                Sim — você pode atualizar o status quando o cliente aprovar.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Posso usar como modelo de orçamento?</h3>
              <p className="mt-1 leading-relaxed">
                Você pode repetir um formato de descrição e valores, mantendo um padrão
                por tipo de serviço/atendimento.
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
            href="/criar-orcamento-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver guia: criar orçamento grátis
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
