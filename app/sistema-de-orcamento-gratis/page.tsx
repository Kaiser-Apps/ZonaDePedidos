import type { Metadata } from "next";
import Link from "next/link";
import { ComoFuncionaInfo } from "@/components/ComoFuncionaInfo";

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

        <ComoFuncionaInfo />
      </div>
    </main>
  );
}
