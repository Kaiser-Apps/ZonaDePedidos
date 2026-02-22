import type { Metadata, Viewport } from "next";
import { Instagram } from "lucide-react";
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
  verification: {
    google: "aV9QjYfte7N_PdYN0suBgF0yiS687gQIiXpGNPHW1dg",
  },
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
      <body className="min-h-screen bg-[#F3F7F4] text-slate-900 flex flex-col">
        <div className="flex-1">{children}</div>

        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          © 2026 Zona de Pedidos ·{" "}
          <a
            href="https://www.instagram.com/zonadepedidos/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center align-middle text-pink-600"
            aria-label="Instagram @zonadepedidos"
          >
            <Instagram size={16} />
          </a>
        </footer>
      </body>
    </html>
  );
}
