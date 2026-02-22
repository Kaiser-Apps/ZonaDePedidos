import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Como funciona",
  description:
    "Entenda como o Zona de Pedidos ajuda você a cadastrar pedidos e orçamentos, compartilhar com clientes e ver o histórico completo por cliente.",
  alternates: {
    canonical: "/como-funciona",
  },
  keywords: [
    "zona de pedidos",
    "pedidos e orçamentos",
    "sistema de pedidos",
    "sistema de orçamento",
    "controle de pedidos",
    "histórico de clientes",
  ],
};

export default function ComoFuncionaPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Zona de Pedidos</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Como o sistema funciona
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
          O <strong>Zona de Pedidos</strong> foi feito para você criar e organizar
          pedidos (e também orçamentos) de um jeito simples, rápido e com
          apresentação profissional para o cliente.
        </p>

        <div className="mt-10 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-bold">
              1) Cadastro fácil de pedidos e orçamentos
            </h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              No cadastro, você pode escrever a descrição <strong>como se fosse um bloco
              de notas de papel</strong>, linha por linha.
            </p>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Conforme você vai digitando, o sistema <strong>já calcula os valores</strong>{" "}
              automaticamente com base no que está na descrição — facilitando na hora
              de montar o pedido/orçamento sem ter que fazer conta manual.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-bold">
              2) Compartilhe e imprima para seus clientes
            </h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Depois de salvar, você consegue <strong>visualizar</strong> o pedido com um
              layout pronto para apresentar.
            </p>
            <p className="mt-3 text-slate-700 leading-relaxed">
              A partir da visualização, dá para <strong>imprimir</strong> ou <strong>compartilhar</strong>{" "}
              com o cliente (por exemplo, copiando o texto ou gerando imagem), o que
              deixa o atendimento mais profissional.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-bold">
              3) Histórico completo por cliente (rápido e fácil)
            </h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Na tela de clientes, você acessa o <strong>histórico completo</strong> de cada
              cliente com poucos cliques.
            </p>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Assim, você encontra rapidamente pedidos antigos e consegue visualizar
              o que foi feito, quando foi feito e quanto foi cobrado.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-bold">Personalize do seu jeito</h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Você também pode <strong>personalizar o layout</strong> do seu pedido.
            </p>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Em <strong>Configurações</strong>, você consegue colocar a <strong>sua logo</strong>, deixando
              o pedido com a identidade da sua empresa.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
