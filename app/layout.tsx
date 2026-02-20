import type { Metadata, Viewport } from "next";
import "./globals.css";

function getMetadataBase(): URL | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "https://www.zonadepedidos.com";

  if (!raw) return undefined;

  const normalized = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;

  try {
    return new URL(normalized);
  } catch {
    return undefined;
  }
}

const metadataBase = getMetadataBase();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Zona de Pedidos",
    template: "%s | Zona de Pedidos",
  },
  description: "Gestão simples e rápida de pedidos e orçamentos.",
  applicationName: "Zona de Pedidos",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
