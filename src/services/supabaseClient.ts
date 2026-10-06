import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('尚未設定 Supabase。請複製 .env.example 為 .env.local 並填入 project URL 與 anon key。');
  }
  return supabase;
}

export function getMissingConfiguration() {
  return [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
  ].filter((value): value is string => Boolean(value));
}