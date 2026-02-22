import type { Metadata } from "next";
import Link from "next/link";
import { ComoFuncionaInfo } from "@/components/ComoFuncionaInfo";

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

        <ComoFuncionaInfo />
      </div>
    </main>
  );
}
