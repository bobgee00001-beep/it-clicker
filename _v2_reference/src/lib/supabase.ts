// Supabase-Client (Phase 3 — Auth + Cloud-Save).
//
// Offline-first-Invariante: ist Supabase NICHT konfiguriert (keine Env-Vars),
// bleibt `supabase` null und die App ist voll lokal spielbar (localStorage).
// Cloud-Features sind dann einfach inaktiv — kein Crash, kein Zwang zum Login.
//
// Der hier genutzte Key ist der PUBLISHABLE/anon-Key — öffentlich, gehört ins
// Frontend; RLS in der DB schützt die Daten. Der sb_secret_-Key kommt NIE hierher.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Magic-Link-Rückkehr (Token im URL-Fragment) automatisch einlösen.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;
