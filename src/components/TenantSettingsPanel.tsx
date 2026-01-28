"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

/* =======================
   TYPES
======================= */

type TenantCtx = {
  tenantId: string;
  userId: string;
};

type TenantInfo = {
  id: string;
  name: string;
  cnpj: string | null;
  ie: string | null;
  endereco: string | null;
  phone: string | null;
  logo_url: string | null;
};

type TenantForm = {
  name: string;
  cnpj: string;
  ie: string;
  endereco: string;
  phone: string;
};

/* =======================
   HELPERS
======================= */

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function maskPhone(value: string) {
  const v = onlyDigits(value).slice(0, 11);

  if (v.length <= 10) {
    return v.replace(
      /(\d{2})(\d{0,4})(\d{0,4})/,
      (_, ddd, p1, p2) =>
        `${ddd ? "(" + ddd + ")" : ""}${p1 ? " " + p1 : ""}${p2 ? "-" + p2 : ""}`
    );
  }

  return v.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2$3-$4");
}

function maskCNPJ(value: string) {
  const v = onlyDigits(value).slice(0, 14);

  return v.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/,
    (_, a, b, c, d, e) =>
      `${a}${b ? "." + b : ""}${c ? "." + c : ""}${d ? "/" + d : ""}${e ? "-" + e : ""}`
  );
}

function maskCPF(value: string) {
  const v = onlyDigits(value).slice(0, 11);
  return v.replace(
    /(\d{3})(\d{3})(\d{3})(\d{0,2})/,
    (_, a, b, c, d) => `${a}${b ? "." + b : ""}${c ? "." + c : ""}${d ? "-" + d : ""}`
  );
}

function maskCpfCnpj(value: string) {
  const d = onlyDigits(value);
  if (d.length <= 11) return maskCPF(d);
  return maskCNPJ(d);
}

const emptyForm: TenantForm = {
  name: "",
  cnpj: "",
  ie: "",
  endereco: "",
  phone: "",
};

/* =======================
   UI HELPERS
======================= */

function Section(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** remove o fundo "grade/cinza" */
  clean?: boolean;
}) {
  return (
    <div
      className={[
        "border rounded-2xl p-4 md:p-5",
        props.clean ? "bg-white" : "bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-extrabold">{props.title}</div>
          {props.subtitle ? (
            <div className="text-xs text-slate-600 mt-1">{props.subtitle}</div>
          ) : null}
        </div>
        {props.right ? <div className="shrink-0 w-full sm:w-auto">{props.right}</div> : null}
      </div>

      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold mb-1">{props.label}</div>
      <input
        className="w-full border rounded-xl px-3 py-2 bg-white"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
      {props.hint ? (
        <div className="text-xs text-slate-500 mt-1">{props.hint}</div>
      ) : null}
    </label>
  );
}

/* =======================
   COMPONENT
======================= */

export default function TenantSettingsPanel() {
  const router = useRouter();

  const [ctx, setCtx] = useState<TenantCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [form, setForm] = useState<TenantForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // logo
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const canSave = useMemo(() => form.name.trim().length > 0, [form.name]);

  const handleBack = () => {
    // Volta para a tela anterior se existir histórico; senão vai para /pedidos
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
    } catch (e) {
      console.log("[TENANT_SETTINGS] handleBack fallback error:", e);
    }
    router.push("/pedidos");
  };

  /* =======================
     1) LOAD CONTEXT (USER + TENANT)
  ======================= */

  useEffect(() => {
    let alive = true;

    const loadCtx = async () => {
      console.log("[TENANT_SETTINGS] Loading context...");
      setCtxLoading(true);

      const { data: userData, error: userErr } = await supabase.auth.getUser();

      if (userErr || !userData.user) {
        console.log("[TENANT_SETTINGS] getUser error:", userErr);
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
        }
        return;
      }

      const userId = userData.user.id;

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();

      if (profileErr || !profile?.tenant_id) {
        console.log("[TENANT_SETTINGS] profile error:", profileErr);
        alert("Usuário sem tenant vinculado. Verifique a tabela profiles.");
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
        }
        return;
      }

      if (alive) {
        setCtx({
          tenantId: String(profile.tenant_id),
          userId,
        });
        setCtxLoading(false);
      }
    };

    loadCtx();

    return () => {
      alive = false;
    };
  }, []);

  /* =======================
     2) LOAD TENANT DATA
  ======================= */

  useEffect(() => {
    const loadTenant = async () => {
      if (!ctx?.tenantId) return;

      console.log("[TENANT_SETTINGS] Loading tenant:", ctx.tenantId);

      setTenantLoading(true);
      setTenantError(null);

      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, cnpj, ie, endereco, phone, logo_url")
        .eq("id", ctx.tenantId)
        .single();

      setTenantLoading(false);

      if (error) {
        console.log("[TENANT_SETTINGS] load tenant error:", error);
        setTenantError(error.message);
        return;
      }

      const t = data as TenantInfo;
      setTenant(t);

      setForm({
        name: t.name || "",
        cnpj: t.cnpj || "",
        ie: t.ie || "",
        endereco: t.endereco || "",
        phone: t.phone || "",
      });

      setLogoUrl(t.logo_url || null);
    };

    loadTenant();
  }, [ctx?.tenantId]);

  /* =======================
     3) UPLOAD LOGO
  ======================= */

  const uploadLogo = async (file: File) => {
    if (!ctx?.tenantId) return;

    setLogoUploading(true);
    console.log("[TENANT_SETTINGS] Uploading logo...");

    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const allowed = ["png", "jpg", "jpeg", "webp"];
      if (!allowed.includes(ext)) {
        alert("Formato inválido. Use PNG/JPG/JPEG/WEBP.");
        return;
      }

      // caminho fixo por tenant (sempre substitui)
      const path = `${ctx.tenantId}/logo.${ext}`;

      // upload (upsert para substituir)
      const { error: upErr } = await supabase.storage
        .from("tenant-logos")
        .upload(path, file, {
          upsert: true,
          cacheControl: "3600",
          contentType: file.type || undefined,
        });

      if (upErr) {
        console.log("[TENANT_SETTINGS] upload error:", upErr);
        alert("Erro ao enviar logo: " + upErr.message);
        return;
      }

      // url pública (bucket é public)
      const { data: pub } = supabase.storage.from("tenant-logos").getPublicUrl(path);
      const publicUrl = pub?.publicUrl || null;

      if (!publicUrl) {
        alert("Upload ok, mas não consegui gerar a URL pública.");
        return;
      }

      // cache-bust (pra atualizar no navegador)
      const finalUrl = `${publicUrl}?v=${Date.now()}`;

      // grava no tenant
      const { error: dbErr } = await supabase
        .from("tenants")
        .update({ logo_url: finalUrl })
        .eq("id", ctx.tenantId);

      if (dbErr) {
        console.log("[TENANT_SETTINGS] update logo_url error:", dbErr);
        alert("Erro ao salvar URL da logo no tenant: " + dbErr.message);
        return;
      }

      setLogoUrl(finalUrl);
      setTenant((t) => (t ? { ...t, logo_url: finalUrl } : t));
      alert("Logo atualizada!");
    } finally {
      setLogoUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!ctx?.tenantId) return;

    if (!confirm("Remover a logo da empresa?")) return;

    setLogoUploading(true);
    console.log("[TENANT_SETTINGS] Removing logo_url...");

    try {
      const { error } = await supabase
        .from("tenants")
        .update({ logo_url: null })
        .eq("id", ctx.tenantId);

      if (error) {
        console.log("[TENANT_SETTINGS] remove logo_url error:", error);
        alert("Erro ao remover logo: " + error.message);
        return;
      }

      setLogoUrl(null);
      setTenant((t) => (t ? { ...t, logo_url: null } : t));
      alert("Logo removida!");
    } finally {
      setLogoUploading(false);
    }
  };

  /* =======================
     4) SAVE (DADOS)
  ======================= */

  const save = async () => {
    if (!ctx?.tenantId) return;

    if (!canSave) {
      alert("Informe o nome da empresa.");
      return;
    }

    console.log("[TENANT_SETTINGS] Saving...");
    setSaving(true);

    const payload = {
      name: form.name.trim(),
        cnpj: form.cnpj ? maskCpfCnpj(form.cnpj) : null,
      ie: form.ie ? form.ie.trim() : null,
      endereco: form.endereco ? form.endereco.trim() : null,
      phone: form.phone ? onlyDigits(form.phone) : null,
    };

    const { error } = await supabase.from("tenants").update(payload).eq("id", ctx.tenantId);

    setSaving(false);

    if (error) {
      console.log("[TENANT_SETTINGS] update error:", error);
      alert("Erro ao salvar: " + error.message);
      return;
    }

    alert("Dados da empresa atualizados com sucesso!");
  };

  /* =======================
     RENDER
  ======================= */

  // ✅ IMPORTANTE: NÃO colocar "bg-white border rounded-2xl" aqui
  // porque o layout.tsx já coloca o card branco do mesmo tamanho do print.

  if (ctxLoading) {
    return (
      <div className="space-y-4">
        <Section
          title="Configurações"
          subtitle="Carregando contexto..."
          clean
        >
          <div className="text-sm text-slate-600">Aguarde…</div>
        </Section>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="space-y-4">
        <Section title="Configurações" subtitle="Falha ao carregar tenant" clean>
          <div className="text-sm text-red-600">
            Não foi possível carregar o tenant do usuário.
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER DO CONTEÚDO (igual vibe do print) */}
      <Section
        title="Configurações da Empresa"
        subtitle="Atualize seus dados e a logo que aparece na pré-visualização e impressão."
        clean
        right={
          <div className="flex gap-2 flex-wrap w-full sm:w-auto">
            <button
              onClick={handleBack}
              className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 w-full sm:w-auto"
              type="button"
            >
              ← Voltar
            </button>

            <button
              onClick={save}
              disabled={saving || !canSave}
              className={[
                "px-5 py-2 rounded-xl text-sm font-semibold w-full sm:w-auto",
                saving || !canSave
                  ? "bg-black/60 text-white cursor-not-allowed"
                  : "bg-black text-white hover:opacity-95",
              ].join(" ")}
              type="button"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        }
      >
        {tenantLoading ? (
          <div className="text-xs text-slate-500">Carregando dados...</div>
        ) : null}
        {tenantError ? (
          <div className="text-xs text-red-600">Erro: {tenantError}</div>
        ) : null}
        {tenant ? (
          <div className="text-xs text-slate-500">
            Cliente: <b>{tenant.name}</b>
          </div>
        ) : null}
      </Section>

      {/* LOGO */}
      <Section
        clean
        title="Logo da empresa"
        subtitle="Envie PNG/JPG/JPEG/WEBP. Essa logo aparece na pré-visualização e na impressão do pedido."
        right={
          <div className="flex gap-2 items-center flex-wrap w-full sm:w-auto">
            <label className="border px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-50 text-sm font-semibold bg-white w-full sm:w-auto text-center">
              {logoUploading ? "Enviando..." : "Enviar logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                disabled={logoUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <button
              className="border px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-50 disabled:opacity-60 w-full sm:w-auto"
              onClick={removeLogo}
              disabled={logoUploading || !logoUrl}
              type="button"
            >
              Remover
            </button>
          </div>
        }
      >
        {logoUrl ? (
          <div className="space-y-3">
            <div className="w-full overflow-hidden">
              <img
                src={logoUrl}
                alt="Logo"
                className="w-full h-44 md:h-56 object-contain"
              />
            </div>

            <div className="text-xs text-slate-500 break-all">{logoUrl}</div>
          </div>
        ) : (
          <div className="text-sm text-slate-700">Nenhuma logo cadastrada.</div>
        )}
      </Section>

      {/* DADOS */}
      <Section
        title="Dados da empresa"
        subtitle="Essas informações aparecem nos pedidos e na impressão."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="Nome *"
            value={form.name}
            onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            placeholder="Ex: Mecânica do Polaco"
          />

          <Field
            label="CPF/CNPJ"
            value={maskCpfCnpj(form.cnpj)}
            onChange={(v) => setForm((p) => ({ ...p, cnpj: v }))}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            hint="Obrigatório para boleto no Asaas."
          />

          <Field
            label="IE"
            value={form.ie}
            onChange={(v) => setForm((p) => ({ ...p, ie: v }))}
            placeholder="Inscrição estadual"
          />

          <Field
            label="Telefone"
            value={maskPhone(form.phone)}
            onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
            placeholder="(11) 99999-9999"
            hint="O sistema salva somente números no banco."
          />

          <div className="md:col-span-2">
            <Field
              label="Endereço"
              value={form.endereco}
              onChange={(v) => setForm((p) => ({ ...p, endereco: v }))}
              placeholder="Rua, número, bairro, cidade - UF"
            />
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Dica: clique em <b>Salvar</b> no topo para aplicar as alterações.
        </div>
      </Section>
    </div>
  );
}
