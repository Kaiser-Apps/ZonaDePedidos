"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";

export default function CadastroPage() {
  const router = useRouter();

  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  const registerTenant = async (accessToken: string, tenantName: string) => {
    console.log("[CADASTRO] calling /api/auth/register", { tenantName });

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ tenantName }),
    });

    const json = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      console.log("[CADASTRO] register tenant error:", {
        status: res.status,
        json,
      });

      // ✅ quando o backend devolve 409: usuário já possui tenant
      if (res.status === 409) {
        throw new Error(
          json?.message ||
            "Este e-mail já possui empresa cadastrada. Faça login."
        );
      }

      throw new Error(json?.message || "Falha ao criar empresa.");
    }

    console.log("[CADASTRO] register tenant ok:", json);
    return json;
  };

  const onSignup = async () => {
    const tenantName = empresa.trim();
    const e = email.trim().toLowerCase();

    if (!tenantName) {
      alert("Informe o nome da empresa.");
      return;
    }
    if (!e || !senha) {
      alert("Informe e-mail e senha.");
      return;
    }
    if (senha.length < 6) {
      alert("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setBusy(true);
    try {
      console.log("[CADASTRO] signUp", { email: e, tenantName });

      const { data: signUpData, error: signUpErr } =
        await supabase.auth.signUp({
          email: e,
          password: senha,
        });

      if (signUpErr) {
        console.log("[CADASTRO] signUp error:", signUpErr);
        alert(signUpErr.message);
        return;
      }

      // Se o projeto exigir confirmação de e-mail, session pode vir null.
      // Então fazemos signIn em seguida para garantir token.
      let accessToken = signUpData.session?.access_token || null;

      if (!accessToken) {
        console.log(
          "[CADASTRO] no session after signUp, trying signInWithPassword..."
        );

        const { data: signInData, error: signInErr } =
          await supabase.auth.signInWithPassword({
            email: e,
            password: senha,
          });

        if (signInErr || !signInData.session?.access_token) {
          console.log("[CADASTRO] signIn after signUp error:", signInErr);
          alert(
            "Conta criada! Verifique seu email para confirmação. Caso não encontre, verifique também a caixa de spam"
          );
          router.replace("/login");
          return;
        }

        accessToken = signInData.session.access_token;
      }

      // ✅ cria tenant + profile via API server (service role)
      try {
        await registerTenant(accessToken, tenantName);
      } catch (e: any) {
        const msg = String(e?.message || e);

        // ✅ se já existe tenant para esse usuário, manda pro login
        if (
          msg.toLowerCase().includes("já possui empresa") ||
          msg.toLowerCase().includes("ja possui empresa") ||
          msg.toLowerCase().includes("faça login") ||
          msg.toLowerCase().includes("faca login")
        ) {
          alert(msg);
          router.replace("/login");
          return;
        }

        // outro erro
        throw e;
      }

      alert("Conta criada com sucesso! ✅");
      router.replace("/");
    } catch (err: any) {
      console.log("[CADASTRO] unexpected error:", err);
      alert(String(err?.message || err));
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
            <div className="text-lg font-extrabold">Criar conta</div>
            <div className="text-xs text-slate-500">
              Comece a usar o Zona de Pedidos
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <div className="text-xs text-slate-600 mb-1">Nome da empresa</div>
            <input
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Ex: Mecânica do Polaco"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>

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
              placeholder="mínimo 6 caracteres"
              type="password"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={onSignup}
            disabled={busy}
            className="w-full bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Criando..." : "Criar conta"}
          </button>

          <div className="text-xs text-slate-600 text-center">
            Já tem conta?{" "}
            <Link href="/login" className="font-bold underline">
              Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
