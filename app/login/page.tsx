"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !senha) {
      alert("Informe e-mail e senha.");
      return;
    }

    setBusy(true);
    try {
      console.log("[LOGIN] signInWithPassword", { email: e });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password: senha,
      });

      if (error) {
        console.log("[LOGIN] error:", error);
        alert(error.message);
        return;
      }

      console.log("[LOGIN] ok session:", Boolean(data.session));
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F7F4] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-green-500 flex items-center justify-center shadow-sm">
            <span className="text-white font-extrabold">Z</span>
          </div>
          <div>
            <div className="text-lg font-extrabold">Zona de Pedidos</div>
            <div className="text-xs text-slate-500">Acesse sua conta</div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <div className="text-xs text-slate-600 mb-1">E-mail</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="text-xs text-slate-600 mb-1">Senha</div>
            <input
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              type="password"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={onLogin}
            disabled={busy}
            className="w-full bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>

          <div className="text-xs text-slate-600 text-center">
            Ainda não tem conta?{" "}
            <Link href="/cadastro" className="font-bold underline">
              Criar conta
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
