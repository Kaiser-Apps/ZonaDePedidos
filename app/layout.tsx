import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zona de Pedidos",
  description: "Gestão simples e rápida de pedidos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#F3F7F4] text-slate-900">
        {children}
      </body>
    </html>
  );
}
