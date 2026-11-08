import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null cuando no hay Supabase configurado: la app guarda en el navegador */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
