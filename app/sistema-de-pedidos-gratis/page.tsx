import type { Metadata } from "next";
import Link from "next/link";
import { ComoFuncionaInfo } from "@/components/ComoFuncionaInfo";

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

        <ComoFuncionaInfo />
      </div>
    </main>
  );
}
