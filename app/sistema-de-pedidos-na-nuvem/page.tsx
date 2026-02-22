import type { Metadata } from "next";
import Link from "next/link";
import { ComoFuncionaInfo } from "@/components/ComoFuncionaInfo";

export const metadata: Metadata = {
  title: "Sistema de Pedidos na Nuvem",
  description:
    "Entenda como o Zona de Pedidos ajuda você a cadastrar pedidos e orçamentos, compartilhar com clientes e ver o histórico completo por cliente.",
  alternates: {
    canonical: "/sistema-de-pedidos-na-nuvem",
  },
  keywords: [
    "sistema de pedidos na nuvem",
    "sistema de pedidos online",
    "controle de pedidos",
    "nuvem",
  ],
};

export default function SistemaDePedidosNaNuvemPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Zona de Pedidos</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Sistema de Pedidos na Nuvem
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
