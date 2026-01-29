"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";

type CapacityInfo = {
  ok: true;
  limit: number;
  count: number;
  remaining: number;
  isFull: boolean;
};

function getAuthErrInfo(err: unknown) {
  const message = String(err?.message || "");
  const asObj = (typeof err === "object" && err !== null
    ? (err as Record<string, unknown>)
    : null);

  const message = String(asObj?.message ?? "");
  const status = asObj?.status;
  const code = asObj?.code;
  return { message, status, code };
}

export default function CadastroPage() {
  const router = useRouter();

  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  const [capacity, setCapacity] = useState<CapacityInfo | null>(null);
  const [capacityMsg, setCapacityMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/auth/capacity", { method: "GET" });
        const json = (await res
          .json()
          .catch(() => ({} as Record<string, unknown>))) as Record<string, unknown>;
        if (cancelled) return;

        if (res.ok && json?.ok) {
          setCapacity(json as CapacityInfo);
          setCapacityMsg(null);
          return;
        }

        setCapacity(null);
        setCapacityMsg(
          String(json?.message || "Não foi possível verificar a capacidade.")
        );
      } catch (e: any) {
      } catch (e: unknown) {
        if (cancelled) return;
        setCapacity(null);
        setCapacityMsg("Não foi possível verificar a capacidade.");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

      // ✅ limite global de contas
      if (res.status === 403) {
        throw new Error(
          json?.message ||
            "Limite de contas atingido no momento. Fale com o suporte."
        );
      }

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
    if (capacity?.isFull) {
      alert(
        `Limite de ${capacity.limit} contas atingido no momento. Fale com o suporte para liberar novas contas.`
      );
      return;
    }

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
          const info = getAuthErrInfo(signUpErr);
      const { data: signUpData, error: signUpErr } =
        await supabase.auth.signUp({
          email: e,
          password: senha,
        });

      if (signUpErr) {
        const info = getAuthErrInfo(signUpErr);
        console.log("[CADASTRO] signUp error (detailed):", info);

        const msg = info.message.toLowerCase();
        const code = String(info.code || "").toLowerCase();
        const status = Number(info.status || 0);

        // ✅ Rate limit (muitas tentativas em pouco tempo)
        if (status === 429) {
          alert(
            "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente."
          );
          return;
        }

        // ✅ Limite de envio de email (confirmação/magic link)
        if (
          code.includes("over_email_send_rate_limit") ||
          msg.includes("email rate limit") ||
          msg.includes("rate limit")
        ) {
          alert(
            "Limite de envio de e-mails atingido. Aguarde alguns minutos e tente novamente."
          );
          return;
        }

        // ✅ Email já cadastrado
        if (
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("user already") ||
          msg.includes("email already") ||
          msg.includes("registered") ||
          msg.includes("exists")
        ) {
          alert("Este e-mail já está cadastrado. Faça login para continuar.");
          router.replace("/login");
          return;
        }

        alert(info.message || "Erro ao criar conta.");
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
          const info = getAuthErrInfo(signInErr);
          console.log("[CADASTRO] signIn after signUp error (detailed):", info);

          const msg = (info.message || "").toLowerCase();
          const code = String(info.code || "").toLowerCase();
          const status = Number(info.status || 0);

          // ✅ Rate limit (muitas tentativas)
          if (status === 429) {
            alert(
              "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente."
            );
            return;
          }

          // ✅ Limite de envio de email (em alguns fluxos)
          if (
            code.includes("over_email_send_rate_limit") ||
            msg.includes("email rate limit") ||
            msg.includes("rate limit")
          ) {
            alert(
              "Limite de envio de e-mails atingido. Aguarde alguns minutos e tente novamente."
            );
            return;
          }

          // ✅ Supabase costuma retornar isso quando:
          // - usuário já existe com outra senha
          // - ou credenciais inválidas
          if (
            msg.includes("invalid login credentials") ||
            msg.includes("invalid") ||
            msg.includes("credentials")
          ) {
            alert("Este e-mail já está cadastrado. Faça login para continuar.");
            router.replace("/login");
            return;
          }

          // ✅ Caso clássico: conta criada mas exige confirmação de email
          alert(
            "Conta criada! Verifique seu email para confirmação. Caso não encontre, verifique também a caixa de spam."
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

        alert(err instanceof Error ? err.message : String(err));
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
          <div className="h-10 w-10 rounded-2xl bg-linear-to-br from-emerald-600 to-green-500 flex items-center justify-center shadow-sm">
            <span className="text-white font-extrabold">Z</span>
          </div>
          <div>
            <div className="text-lg font-extrabold">Criar conta</div>
            <div className="text-xs text-slate-500">
              Comece a usar o Zona de Pedidos
            </div>
          </div>
        </div>

        {capacity?.isFull ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Limite de {capacity.limit} contas atingido no momento. Fale com o
            suporte para liberar novas contas.
          </div>
        ) : capacity ? (
          <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
            Vagas disponíveis: <span className="font-semibold">{capacity.remaining}</span> de {capacity.limit}
          </div>
        ) : capacityMsg ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {capacityMsg}
          </div>
        ) : null}

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
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
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
            disabled={busy || capacity?.isFull === true}
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
