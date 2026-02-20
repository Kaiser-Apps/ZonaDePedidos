import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Controle de Pedidos Grátis",
  description:
    "Controle de pedidos grátis e online: acompanhe status, clientes e valores em um gerenciador simples. Ideal para pequenas empresas e MEI.",
  alternates: {
    canonical: "/controle-de-pedidos-gratis",
  },
  keywords: [
    "controle de pedidos grátis",
    "sistema de controle de pedidos online grátis",
    "gerenciador de pedidos grátis",
    "como controlar pedidos online grátis",
  ],
};

export default function ControleDePedidosGratisPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Zona de Pedidos</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Controle de Pedidos Grátis
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
          O <strong>controle de pedidos grátis</strong> fica mais fácil quando você
          organiza tudo em um lugar só: pedidos, orçamentos, clientes, status e valores.
          Se você procura um <strong>sistema de controle de pedidos online grátis</strong>,
          o Zona de Pedidos foi feito para simplificar o dia a dia.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold">Como controlar pedidos online grátis</h2>
          <p className="mt-3 text-slate-700 leading-relaxed">
            Em vez de anotar em caderno ou planilha, você cria um registro por pedido e
            atualiza o status conforme avança (aberto, orçamento, aguardando retirada,
            pago, etc.). Isso reduz erros e melhora a visibilidade do que está pendente.
          </p>
        </div>

        <h2 className="mt-10 text-xl font-bold">Long tail (menos concorrência)</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Esta página atende buscas bem específicas, como “<strong>como controlar pedidos online grátis</strong>”,
          “<strong>ferramenta grátis para controle de vendas e pedidos</strong>” e “<strong>controle de pedidos online simples</strong>”.
          Essas buscas costumam converter melhor porque já indicam a dor real do usuário.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/cadastro"
            className="bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Criar conta grátis
          </Link>
          <Link
            href="/gestao-de-pedidos-gratis"
            className="border border-slate-200 bg-white px-5 py-2 rounded-xl text-sm font-semibold"
          >
            Ver gestão de pedidos grátis
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
