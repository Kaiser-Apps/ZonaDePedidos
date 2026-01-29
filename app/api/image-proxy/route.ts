import { NextRequest } from "next/server";

function isAllowedSupabaseStorageUrl(target: URL): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  let supabaseHost: string;
  try {
    supabaseHost = new URL(supabaseUrl).host;
  } catch {
    return false;
  }

  if (target.protocol !== "https:") return false;
  if (target.host !== supabaseHost) return false;

  // Only allow Supabase Storage object URLs.
  if (!target.pathname.startsWith("/storage/v1/object/")) return false;

  // Restrict to public tenant logos bucket.
  if (!target.pathname.includes("/public/tenant-logos/")) return false;

  return true;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const targetParam = url.searchParams.get("url");

  if (!targetParam) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(targetParam);
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }

  if (!isAllowedSupabaseStorageUrl(target)) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstream = await fetch(target.toString(), { cache: "no-store" });
  if (!upstream.ok) {
    return new Response("Upstream error", { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const body = await upstream.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      // Helpful for some canvas/image pipelines.
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
}
