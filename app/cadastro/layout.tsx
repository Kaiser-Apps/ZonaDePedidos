import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cadastro",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CadastroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
