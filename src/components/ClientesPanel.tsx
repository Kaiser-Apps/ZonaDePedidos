"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type TenantCtx = {
  tenantId: string;
  userId: string;
};

type ClientRow = {
  id: string;
  telefone: string;
  nome: string;
  endereco: string | null;
  cpf: string | null;
  cnpj: string | null;
  ie: string | null;
  created_at: string;
};

type ClientForm = {
  id?: string;
  telefone: string;
  nome: string;
  endereco: string;
  cpf: string;
  cnpj: string;
  ie: string;
};

const emptyForm: ClientForm = {
  telefone: "",
  nome: "",
  endereco: "",
  cpf: "",
  cnpj: "",
  ie: "",
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function normalizeForm(form: ClientForm): ClientForm {
  return {
    ...form,
    telefone: form.telefone.trim(),
    nome: form.nome.trim(),
    endereco: form.endereco.trim(),
    cpf: form.cpf.trim(),
    cnpj: form.cnpj.trim(),
    ie: form.ie.trim(),
  };
}

/**
 * Máscara Telefone BR:
 * - 10 dígitos: (11) 9999-8888
 * - 11 dígitos: (11) 99999-8888
 */
function maskPhone(value: string) {
  const v = onlyDigits(value).slice(0, 11);

  // 10 dígitos
  if (v.length <= 10) {
    return v.replace(
      /(\d{2})(\d{0,4})(\d{0,4})/,
      (_, ddd, p1, p2) =>
        `${ddd ? "(" + ddd + ")" : ""}${p1 ? " " + p1 : ""}${p2 ? "-" + p2 : ""}`
    );
  }

  // 11 dígitos
  return v.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2$3-$4");
}

function maskCPF(value: string) {
  const v = onlyDigits(value).slice(0, 11);

  return v.replace(
    /(\d{3})(\d{3})(\d{3})(\d{0,2})/,
    (_, a, b, c, d) =>
      `${a}${b ? "." + b : ""}${c ? "." + c : ""}${d ? "-" + d : ""}`
  );
}

function maskCNPJ(value: string) {
  const v = onlyDigits(value).slice(0, 14);

  return v.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/,
    (_, a, b, c, d, e) =>
      `${a}${b ? "." + b : ""}${c ? "." + c : ""}${d ? "/" + d : ""}${e ? "-" + e : ""}`
  );
}

function supabaseDuplicateMessage(err: any) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("uq_clients_tenant_tel"))
    return "Telefone já cadastrado para esta empresa.";
  if (msg.includes("uq_clients_tenant_cpf"))
    return "CPF já cadastrado para esta empresa.";
  if (msg.includes("uq_clients_tenant_cnpj"))
    return "CNPJ já cadastrado para esta empresa.";
  if (err?.code === "23505") return "Já existe um cliente com esses dados.";
  return null;
}

export default function ClientesPanel() {
  const [ctx, setCtx] = useState<TenantCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [q, setQ] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);

  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  // 1) Descobre user + tenant_id (via profiles)
  useEffect(() => {
    let alive = true;

    const loadCtx = async () => {
      setCtxLoading(true);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
        }
        return;
      }

      const userId = userData.user.id;

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();

      if (profErr || !prof?.tenant_id) {
        console.log("profiles error:", profErr);
        alert(
          "Seu usuário não está vinculado a uma empresa (tenant). Confira a tabela profiles."
        );
        if (alive) {
          setCtx(null);
          setCtxLoading(false);
        }
        return;
      }

      if (alive) {
        setCtx({ tenantId: prof.tenant_id, userId });
        setCtxLoading(false);
      }
    };

    loadCtx();

    return () => {
      alive = false;
    };
  }, []);

  // 2) Carrega lista (com busca)
  const loadClients = async () => {
    if (!ctx) return;

    setLoadingList(true);

    const query = supabase
      .from("clients")
      .select("id, telefone, nome, endereco, cpf, cnpj, ie, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    const qq = q.trim();
    const finalQuery =
      qq.length > 0
        ? query.or(
            [
              `nome.ilike.%${qq}%`,
              `telefone.ilike.%${qq}%`,
              `cpf.ilike.%${qq}%`,
              `cnpj.ilike.%${qq}%`,
            ].join(",")
          )
        : query;

    const { data, error } = await finalQuery;

    setLoadingList(false);

    if (error) {
      console.log("load clients error:", error);
      alert("Erro ao carregar clientes: " + error.message);
      return;
    }

    setRows((data || []) as ClientRow[]);
  };

  useEffect(() => {
    if (!ctx) return;
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const resetForm = () => setForm(emptyForm);

  const pickRow = (r: ClientRow) => {
    // OBS: no banco agora vamos salvar só números; então ao editar, a máscara vai reaplicar.
    setForm({
      id: r.id,
      telefone: maskPhone(r.telefone || ""),
      nome: r.nome || "",
      endereco: r.endereco || "",
      cpf: maskCPF(r.cpf || ""),
      cnpj: maskCNPJ(r.cnpj || ""),
      ie: r.ie || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (r: ClientRow) => {
    if (!confirm(`Excluir o cliente "${r.nome}"?`)) return;

    const { error } = await supabase.from("clients").delete().eq("id", r.id);

    if (error) {
      console.log("delete client error:", error);
      alert("Erro ao excluir: " + error.message);
      return;
    }

    if (form.id === r.id) resetForm();
    await loadClients();
  };

  const save = async () => {
    if (!ctx) return;

    const nf = normalizeForm(form);

    if (!nf.nome) return alert("Preencha o nome.");
    if (!nf.telefone) return alert("Preencha o telefone.");

    // ✅ salva só números no banco (melhor pra busca/duplicidade)
    const telefoneNorm = onlyDigits(nf.telefone);
    const cpfNorm = onlyDigits(nf.cpf);
    const cnpjNorm = onlyDigits(nf.cnpj);

    setSaving(true);

    const payload = {
      tenant_id: ctx.tenantId,
      telefone: telefoneNorm,
      nome: nf.nome,
      endereco: nf.endereco || null,
      cpf: cpfNorm || null,
      cnpj: cnpjNorm || null,
      ie: nf.ie || null,
      updated_by: ctx.userId,
    };

    try {
      if (isEdit && form.id) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", form.id);

        if (error) {
          const friendly = supabaseDuplicateMessage(error);
          if (friendly) return alert(friendly);
          console.log("update error:", error);
          return alert("Erro ao atualizar: " + error.message);
        }

        alert("Cliente atualizado!");
      } else {
        const { error } = await supabase.from("clients").insert([
          {
            ...payload,
            created_by: ctx.userId,
          },
        ]);

        if (error) {
          const friendly = supabaseDuplicateMessage(error);
          if (friendly) return alert(friendly);
          console.log("insert error:", error);
          return alert("Erro ao salvar: " + error.message);
        }

        alert("Cliente cadastrado!");
      }

      resetForm();
      await loadClients();
    } finally {
      setSaving(false);
    }
  };

  if (ctxLoading) {
    return (
      <div className="border rounded p-4">
        <div className="font-semibold">Clientes</div>
        <div className="text-gray-600 mt-2">Carregando contexto...</div>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="border rounded p-4">
        <div className="font-semibold">Clientes</div>
        <div className="text-red-600 mt-2">
          Não foi possível carregar seu tenant. Verifique se existe um registro na
          tabela <b>profiles</b> para seu usuário.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* FORM */}
      <div className="border rounded p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-lg">
              {isEdit ? "Editar Cliente" : "Cadastrar Cliente"}
            </div>
            <div className="text-sm text-gray-600">
              Empresa (tenant): {ctx.tenantId}
            </div>
          </div>

          <div className="flex gap-2">
            {isEdit && (
              <button
                onClick={resetForm}
                className="border px-3 py-2 rounded"
                disabled={saving}
              >
                Cancelar edição
              </button>
            )}

            <button
              onClick={save}
              className="bg-black text-white px-3 py-2 rounded"
              disabled={saving}
            >
              {saving ? "Salvando..." : isEdit ? "Atualizar" : "Salvar"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <Field
            label="Telefone *"
            value={form.telefone}
            onChange={(v) => setForm((s) => ({ ...s, telefone: maskPhone(v) }))}
            placeholder="(11) 99999-9999"
          />
          <Field
            label="Nome *"
            value={form.nome}
            onChange={(v) => setForm((s) => ({ ...s, nome: v }))}
            placeholder="Nome do cliente"
          />
          <Field
            label="Endereço"
            value={form.endereco}
            onChange={(v) => setForm((s) => ({ ...s, endereco: v }))}
            placeholder="Rua, número, bairro..."
          />
          <Field
            label="CPF"
            value={form.cpf}
            onChange={(v) => setForm((s) => ({ ...s, cpf: maskCPF(v) }))}
            placeholder="000.000.000-00"
          />
          <Field
            label="CNPJ"
            value={form.cnpj}
            onChange={(v) => setForm((s) => ({ ...s, cnpj: maskCNPJ(v) }))}
            placeholder="00.000.000/0000-00"
          />
          <Field
            label="IE"
            value={form.ie}
            onChange={(v) => setForm((s) => ({ ...s, ie: v }))}
            placeholder="Inscrição estadual"
          />
        </div>

        <div className="text-xs text-gray-500 mt-3">
          Dica: duplicidade é travada por empresa (telefone/CPF/CNPJ), igual no seu
          Apps Script.
        </div>
      </div>

      {/* LIST + SEARCH */}
      <div className="border rounded p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div>
            <div className="font-bold text-lg">Lista de Clientes</div>
            <div className="text-sm text-gray-600">
              Clique em um cliente para editar.
            </div>
          </div>

          <div className="flex gap-2">
            <input
              className="border rounded px-3 py-2 w-full md:w-96"
              placeholder="Buscar por nome, telefone, CPF ou CNPJ..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadClients();
              }}
            />
            <button
              onClick={loadClients}
              className="border px-3 py-2 rounded"
              disabled={loadingList}
            >
              {loadingList ? "Buscando..." : "Buscar"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border px-3 py-2">Nome</th>
                <th className="border px-3 py-2">Telefone</th>
                <th className="border px-3 py-2">CPF</th>
                <th className="border px-3 py-2">CNPJ</th>
                <th className="border px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="border px-3 py-3 text-gray-600" colSpan={5}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td
                      className="border px-3 py-2 cursor-pointer"
                      onClick={() => pickRow(r)}
                    >
                      {r.nome}
                    </td>

                    {/* ✅ mostra formatado */}
                    <td className="border px-3 py-2">{maskPhone(r.telefone)}</td>
                    <td className="border px-3 py-2">
                      {r.cpf ? maskCPF(r.cpf) : ""}
                    </td>
                    <td className="border px-3 py-2">
                      {r.cnpj ? maskCNPJ(r.cnpj) : ""}
                    </td>

                    <td className="border px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          className="border px-2 py-1 rounded"
                          onClick={() => pickRow(r)}
                        >
                          Editar
                        </button>
                        <button
                          className="border px-2 py-1 rounded"
                          onClick={() => remove(r)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="text-xs text-gray-500 mt-3">
            Mostrando até 200 registros (ordenado por criação).
          </div>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{props.label}</div>
      <input
        className="border rounded px-3 py-2 w-full"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </label>
  );
}
