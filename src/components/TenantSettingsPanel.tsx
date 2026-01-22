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
        `${ddd ? "(" + ddd + ")" : ""}${p1 ? " " + p1 : ""}${
          p2 ? "-" + p2 : ""
        }`
    );
  }

  return v.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2$3-$4");
}

function maskCNPJ(value: string) {
  const v = onlyDigits(value).slice(0, 14);

  return v.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/,
    (_, a, b, c, d, e) =>
      `${a}${b ? "." + b : ""}${c ? "." + c : ""}${
        d ? "/" + d : ""
      }${e ? "-" + e : ""}`
  );
}

const emptyForm: TenantForm = {
  name: "",
  cnpj: "",
  ie: "",
  endereco: "",
  phone: "",
};

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

  const canSave = useMemo(() => {
    return form.name.trim().length > 0;
  }, [form.name]);

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
          tenantId: profile.tenant_id,
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
      const { data: pub } = supabase.storage
        .from("tenant-logos")
        .getPublicUrl(path);

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
      cnpj: form.cnpj ? maskCNPJ(form.cnpj) : null,
      ie: form.ie ? form.ie.trim() : null,
      endereco: form.endereco ? form.endereco.trim() : null,
      phone: form.phone ? onlyDigits(form.phone) : null,
    };

    const { error } = await supabase
      .from("tenants")
      .update(payload)
      .eq("id", ctx.tenantId);

    setSaving(false);

    if (error) {
      console.log("[TENANT_SETTINGS] update error:", error);
      alert("Erro ao salvar: " + error.message);
      return;
    }

    alert("Dados do tenant atualizados com sucesso!");
  };

  /* =======================
     RENDER
  ======================= */

  if (ctxLoading) {
    return <div className="p-4">Carregando contexto...</div>;
  }

  if (!ctx) {
    return (
      <div className="p-4 border rounded bg-white">
        Não foi possível carregar o tenant do usuário.
      </div>
    );
  }

  return (
    <div className="bg-white border rounded p-4">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="border px-3 py-2 rounded hover:bg-gray-50 text-sm"
          >
            ← Voltar
          </button>

          <div>
            <div className="text-lg font-bold">Configurações da Empresa</div>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving || !canSave}
          className={`border px-4 py-2 rounded ${
            saving || !canSave
              ? "opacity-60 cursor-not-allowed"
              : "hover:bg-gray-50"
          }`}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {/* STATUS */}
      {tenantLoading && (
        <div className="mt-4 text-sm">Carregando dados do tenant...</div>
      )}

      {tenantError && (
        <div className="mt-4 text-sm text-red-600">Erro: {tenantError}</div>
      )}

      {/* LOGO */}
      <div className="mt-4 border rounded p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">Logo da empresa</div>
            <div className="text-xs text-slate-500">
              Envie PNG/JPG. Essa logo aparece na pré-visualização e na impressão do pedido.
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <label className="border px-3 py-2 rounded cursor-pointer hover:bg-gray-50 text-sm">
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
              className="border px-3 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-60"
              onClick={removeLogo}
              disabled={logoUploading || !logoUrl}
              type="button"
            >
              Remover
            </button>
          </div>
        </div>

        {logoUrl ? (
          <div className="mt-3 flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Logo"
              className="h-16 w-16 rounded border object-contain bg-white"
            />
            <div className="text-xs text-slate-500 break-all">{logoUrl}</div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-600">
            Nenhuma logo cadastrada.
          </div>
        )}
      </div>

      {/* FORM */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold">Nome</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm font-semibold">CNPJ</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={maskCNPJ(form.cnpj)}
            onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm font-semibold">IE</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.ie}
            onChange={(e) => setForm((p) => ({ ...p, ie: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm font-semibold">Telefone</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={maskPhone(form.phone)}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-semibold">Endereço</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.endereco}
            onChange={(e) =>
              setForm((p) => ({ ...p, endereco: e.target.value }))
            }
          />
        </div>
      </div>
    </div>
  );
}
