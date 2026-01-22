export const asaasBaseUrl = () => {
  const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
};

export async function asaasFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurado.");

  const url = `${asaasBaseUrl()}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const txt = await res.text();
  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = { raw: txt };
  }

  if (!res.ok) {
    console.log("[ASAAS] ERROR", res.status, path, json);
    throw new Error(json?.errors?.[0]?.description || json?.message || "Erro Asaas");
  }

  return json;
}
