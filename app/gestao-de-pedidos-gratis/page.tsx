import type { Metadata } from "next";
import Link from "next/link";
import { ComoFuncionaInfo } from "@/components/ComoFuncionaInfo";

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

        <ComoFuncionaInfo />
      </div>
    </main>
  );
}
