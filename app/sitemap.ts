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
    "/como-funciona",

    "/sistema-de-pedidos-online-gratis",
    "/sistema-de-pedidos-simples",
    "/sistema-de-pedidos-para-pequenas-empresas",
    "/sistema-de-pedidos-para-celular",
    "/sistema-de-pedidos-na-nuvem",
    "/controle-de-vendas-gratis",

    "/gerador-de-orcamento-online-gratis",
    "/sistema-para-autonomos",
    "/sistema-para-microempresa",
    "/sistema-para-pequeno-negocio",
    "/sistema-para-prestador-de-servicos",
    "/sistema-para-vendedor-autonomo",

    "/modelo-de-orcamento-online",
    "/sistema-de-pedidos-para-loja",
    "/sistema-de-pedidos-para-delivery",
    "/sistema-de-pedidos-para-roupas",
    "/sistema-de-pedidos-para-servicos",

    "/como-organizar-pedidos-de-clientes",
    "/como-controlar-pedidos-no-excel",
    "/como-fazer-orcamento-profissional",
    "/como-controlar-vendas-de-clientes",
    "/como-organizar-pedidos-pelo-celular",
    "/sistema-para-enviar-orcamento-ao-cliente",

    "/alternativa-ao-excel-para-pedidos",
    "/sistema-de-pedidos-melhor-que-planilha",
    "/controle-de-pedidos-sem-excel",
    "/sistema-de-orcamento-online-vs-planilha",
    "/orcamento-profissional-gratis",
  ];

  return urls.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.8,
  }));
}
