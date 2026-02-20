import type { MetadataRoute } from "next";

function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "https://www.zonadepedidos.com";

  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl().replace(/\/$/, "");
  const lastModified = new Date();

  const urls = [
    "/sistema-de-pedidos-gratis",
    "/sistema-de-orcamento-gratis",
    "/controle-de-pedidos-gratis",
    "/gestao-de-pedidos-gratis",
    "/criar-orcamento-gratis",
    "/para-mei",
  ];

  return urls.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.8,
  }));
}
