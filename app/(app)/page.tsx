"use client";

import { useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useRouter } from "next/navigation";
import ClientesPanel from "../../src/components/ClientesPanel";
import PedidosPanel from "../../src/components/PedidosPanel";

export default function AppHome() {
  const router = useRouter();
  const [tab, setTab] = useState<"pedidos" | "clientes">("pedidos");

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

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
      </div>

      <div className="px-6 py-6">
        {tab === "pedidos" ? <PedidosPanel /> : <ClientesPanel />}
      </div>
    </main>
  );
}
