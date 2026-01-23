"use client";

import { useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";
import ClientesPanel from "../../src/components/ClientesPanel";
import PedidosPanel from "../../src/components/PedidosPanel";

export default function AppHome() {
  const router = useRouter();
  const [tab, setTab] = useState<"pedidos" | "clientes">("pedidos");
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    try {
      // ✅ desmonta o app imediatamente (evita chamadas enquanto desloga)
      setLoggingOut(true);
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
    }
  };

  if (loggingOut) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Saindo...
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="px-6 pt-4 flex gap-2">
        <button
          onClick={() => setTab("pedidos")}
          className={`px-4 py-2 rounded border ${
            tab === "pedidos" ? "bg-black text-white" : ""
          }`}
        >
          Pedidos
        </button>

        <button
          onClick={() => setTab("clientes")}
          className={`px-4 py-2 rounded border ${
            tab === "clientes" ? "bg-black text-white" : ""
          }`}
        >
          Clientes
        </button>

        {/* Se você já tem um botão Sair no topo em outro lugar, pode ignorar este.
            Se quiser manter aqui também: */}
        <button
          onClick={logout}
          className="ml-auto px-4 py-2 rounded border hover:bg-gray-50"
        >
          Sair
        </button>
      </div>

      <div className="px-6 py-6">
        {tab === "pedidos" ? <PedidosPanel /> : <ClientesPanel />}
      </div>
    </main>
  );
}
