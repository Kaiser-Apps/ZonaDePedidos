// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Logs (aparecem no console do servidor e também podem aparecer no client)
console.log("[SUPABASE ENV] url:", supabaseUrl);
console.log("[SUPABASE ENV] anonKey present:", !!supabaseAnonKey);

if (!supabaseUrl) {
  throw new Error(
    "supabaseUrl is required. Verifique NEXT_PUBLIC_SUPABASE_URL no .env.local e reinicie o servidor."
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "supabaseAnonKey is required. Verifique NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local e reinicie o servidor."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
