import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/** Server-only client with the service role. Never import from client components. */
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

let _browser: SupabaseClient | null = null;

/** Anon client for realtime "something changed" signals in the browser. Returns null if not configured. */
export function browser(): SupabaseClient | null {
  if (_browser) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _browser = createClient(url, key, { auth: { persistSession: false } });
  return _browser;
}
