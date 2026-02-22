"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";

const EMAIL_CACHE_KEY = "zp_last_email";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const [busy, setBusy] = useState(false);

  // ✅ Reenvio com proteção de rate limit
  const [resendBusy, setResendBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // ✅ Só mostra o botão depois do erro "Email not confirmed"
  const [showResend, setShowResend] = useState(false);

  // ✅ Carrega o último email salvo (cache)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(EMAIL_CACHE_KEY) || "";
      if (cached) setEmail(cached);
    } catch {}
  }, []);

  // ✅ Atualiza cooldown do reenvio
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // ✅ Salva email no cache (use no onChange / onBlur)
  const setEmailAndCache = (value: string) => {
    setEmail(value);
    try {
      localStorage.setItem(EMAIL_CACHE_KEY, value.trim().toLowerCase());
    } catch {}
  };

  const onLogin = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !senha) {
      alert("Informe e-mail e senha.");
      return;
    }

    // ✅ sempre salva o email usado
    try {
      localStorage.setItem(EMAIL_CACHE_KEY, e);
    } catch {}

    setBusy(true);
    try {
      console.log("[LOGIN] signInWithPassword", { email: e });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password: senha,
      });

      if (error) {
        console.log("[LOGIN] error:", error);

        if (error.message === "Email not confirmed") {
          // ✅ habilita o botão somente nesse caso
          setShowResend(true);

          alert(
            "Seu email ainda não foi confirmado 📩\n\nVerifique sua caixa de entrada ou spam e clique no link de ativação.\n\nAgora você pode usar o botão para reenviar."
          );
        } else {
          alert(error.message);
        }

        return;
      }

      console.log("[LOGIN] ok session:", Boolean(data.session));
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  const onResendConfirmation = async () => {
    const e = email.trim().toLowerCase();

    if (!e) {
      alert("Informe seu e-mail primeiro.");
      return;
    }

    if (cooldown > 0) {
      alert(`Aguarde ${cooldown}s para reenviar novamente.`);
      return;
    }

    setResendBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: e,
      });

      if (error) {
        console.log("[LOGIN] resend error:", error);

        const msg = (error.message || "").toLowerCase();

        if (msg.includes("rate limit")) {
          setCooldown(120);
          alert(
            "Você solicitou muitos envios em pouco tempo.\n\nAguarde 2 minutos e tente novamente."
          );
          return;
        }

        alert(error.message);
        return;
      }

      setCooldown(60);
      alert("Email de confirmação reenviado! 📩\n\nVerifique sua caixa de entrada e o spam.");
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F7F4] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-linear-to-br from-emerald-600 to-green-500 flex items-center justify-center shadow-sm">
            <span className="text-white font-extrabold">Z</span>
          </div>
          <div>
            <div className="text-lg font-extrabold">Zona de Pedidos</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Acesse sua conta</div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mb-1">E-mail</div>
            <input
              value={email}
              onChange={(e) => setEmailAndCache(e.target.value)}
              onBlur={(e) => setEmailAndCache(e.target.value)}
              placeholder="seuemail@exemplo.com"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-xl px-3 py-2 text-sm"
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mb-1">Senha</div>
            <input
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              type="password"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-xl px-3 py-2 text-sm"
              autoComplete="current-password"
            />
          </div>

          <button
            onClick={onLogin}
            disabled={busy}
            className="w-full bg-black text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>

          {/* ✅ Só aparece depois do erro "Email not confirmed" */}
          {showResend && (
            <button
              onClick={onResendConfirmation}
              disabled={resendBusy || cooldown > 0}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              {cooldown > 0
                ? `Reenviar em ${cooldown}s`
                : resendBusy
                ? "Reenviando..."
                : "Reenviar email de confirmação"}
            </button>
          )}

          <div className="text-xs text-slate-600 dark:text-slate-300 text-center">
            Ainda não tem conta?{" "}
            <Link href="/cadastro" className="font-bold underline">
              Criar conta
            </Link>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-300 text-center">
            <Link href="/como-funciona" className="font-bold underline">
              Como funciona
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
