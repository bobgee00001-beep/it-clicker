// Auth-Store (Phase 3 — Magic-Link + Invite-Gate).
//
// Sicherheits-/Status-Kern. Klassisches writable-Factory-Muster wie theme.ts.
// Offline-first: ist Supabase nicht konfiguriert, ist der Status dauerhaft
// 'unavailable' und die App läuft rein lokal weiter (kein Login-Zwang).
//
// Invite-Flow: Login per Magic-Link (jede Mail). Wer über einen Invite-Link
// kommt (…/?invite=CODE), dessen Code wird nach erfolgreichem Login automatisch
// gegen redeem_invite() eingelöst -> aus 'needs-invite' wird 'player'.
import { writable, type Readable, get } from 'svelte/store';
import { supabase, supabaseConfigured } from '../lib/supabase';

export type AuthStatus =
  | 'loading' //       Initial: Session wird geprüft.
  | 'unavailable' //   Supabase nicht konfiguriert -> reiner Lokal-Modus.
  | 'signed-out' //    Keine Session.
  | 'needs-invite' //  Eingeloggt, aber (noch) kein Spieler (kein Invite eingelöst).
  | 'player'; //       Eingeloggt + Spieler -> Cloud-Save aktiv.

export type AuthState = {
  status: AuthStatus;
  email: string | null;
  userId: string | null;
};

export type AuthStore = Readable<AuthState> & {
  /** Magic-Link an die Mail schicken. */
  signInWithEmail(email: string): Promise<{ ok: boolean; error?: string }>;
  /** Invite-Code einlösen -> Spieler werden. */
  redeemInvite(code: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  /** Spieler-Status (is_player RPC) neu prüfen. */
  refreshPlayerStatus(): Promise<void>;
};

const INITIAL: AuthState = {
  status: supabaseConfigured ? 'loading' : 'unavailable',
  email: null,
  userId: null,
};

// Invite-Code EINMAL aus der URL ziehen (vor späteren Navigationen), damit der
// Link-Flow auch über den Magic-Link-Redirect hinweg trägt.
function captureInviteFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const code = new URLSearchParams(window.location.search).get('invite');
    return code && code.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

function createAuthStore(): AuthStore {
  const { subscribe, set, update } = writable<AuthState>(INITIAL);
  let pendingInvite = captureInviteFromUrl();

  async function checkPlayer(): Promise<boolean> {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('is_player');
    if (error) return false;
    return data === true;
  }

  async function applySession(userId: string | null, email: string | null): Promise<void> {
    if (!userId) {
      set({ status: 'signed-out', email: null, userId: null });
      return;
    }
    // Eingeloggt: Spieler-Status prüfen. Wenn noch kein Spieler und ein Invite
    // aus dem Link vorliegt -> automatisch einlösen.
    let isPlayer = await checkPlayer();
    if (!isPlayer && pendingInvite) {
      const res = await redeemInvite(pendingInvite);
      pendingInvite = null;
      isPlayer = res.ok;
    }
    set({ status: isPlayer ? 'player' : 'needs-invite', email, userId });
  }

  async function signInWithEmail(email: string): Promise<{ ok: boolean; error?: string }> {
    if (!supabase) return { ok: false, error: 'Cloud-Login nicht verfügbar.' };
    const trimmed = email.trim();
    if (!trimmed) return { ok: false, error: 'Bitte eine E-Mail-Adresse eingeben.' };
    // Rückkehr-URL inkl. ?invite= erhalten, damit der Code den Round-Trip übersteht.
    const emailRedirectTo = typeof window !== 'undefined' ? window.location.href : undefined;
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed, options: { emailRedirectTo } });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function redeemInvite(code: string): Promise<{ ok: boolean; error?: string }> {
    if (!supabase) return { ok: false, error: 'Cloud nicht verfügbar.' };
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: 'Bitte einen Invite-Code eingeben.' };
    const { data, error } = await supabase.rpc('redeem_invite', { p_code: trimmed });
    if (error) return { ok: false, error: error.message };
    if (data !== true) return { ok: false, error: 'Invite-Code ungültig oder deaktiviert.' };
    await refreshPlayerStatus();
    return { ok: true };
  }

  async function refreshPlayerStatus(): Promise<void> {
    const cur = get({ subscribe });
    if (!cur.userId) return;
    const isPlayer = await checkPlayer();
    update((s) => ({ ...s, status: isPlayer ? 'player' : 'needs-invite' }));
  }

  async function signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ status: 'signed-out', email: null, userId: null });
  }

  // Initialisierung: bestehende Session laden + auf Auth-Änderungen hören.
  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      void applySession(u?.id ?? null, u?.email ?? null);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      void applySession(u?.id ?? null, u?.email ?? null);
    });
  }

  return { subscribe, signInWithEmail, redeemInvite, signOut, refreshPlayerStatus };
}

export const auth = createAuthStore();
