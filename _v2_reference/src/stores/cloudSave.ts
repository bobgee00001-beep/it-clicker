// Cloud-Save-Sync (Phase 3). Offline-first: localStorage bleibt der Arbeits-Cache,
// die Cloud ist die Sync-Schicht. Ohne Login/Supabase passiert hier nichts.
//
// Reconcile-Strategie nach Codex-Review (gpt-5.5/high):
//   - chooseNewer nutzt totalEarnedScaled (MONOTON, nie rückläufig) als Primär-
//     schlüssel -> kein Datenverlust durch Wall-Clock-Skew zwischen Geräten.
//     lastSavedMs nur als Tiebreak.
//   - Reconcile ist gegen Uploads gegated + session-tokenisiert (Cross-Session-
//     Race-Schutz). pullCloud unterscheidet missing/ok/error -> bei Lesefehler
//     wird die Cloud nicht blind überschrieben.
//
// BEKANNTE Slice-1-Grenze (deferred): keine Cloud-CAS/Versionierung und kein
// Tab-Leader -> zwei gleichzeitig offene Tabs desselben Users können sich beim
// Upload überschreiben. Für einen Abteilungs-Clicker (1 Person, meist 1 Tab)
// akzeptabel; echte Lösung = `updated_at`-CAS beim Upsert + BroadcastChannel.
import { supabase } from '../lib/supabase';
import { serialize, deserialize } from '../engine/save';
import { auth } from './auth';
import { get } from 'svelte/store';
import type { GameState } from '../engine/types';

const TABLE = 'saves';
const DEBOUNCE_MS = 4000;

// --- Reine Entscheidungslogik (testbar, ohne Netz) -------------------------
// Welcher Save wird behalten?
//   1. höherer totalEarnedScaled gewinnt (Lifetime-Fortschritt, MONOTON),
//   2. bei Gleichstand: jüngerer lastSavedMs (Wall-Clock-Tiebreak),
//   3. immer noch gleich: 'local' (kein unnötiges Adoptieren/Flackern).
export function chooseNewer(local: GameState, cloud: GameState): 'local' | 'cloud' {
  if (cloud.totalEarnedScaled > local.totalEarnedScaled) return 'cloud';
  if (cloud.totalEarnedScaled < local.totalEarnedScaled) return 'local';
  return cloud.lastSavedMs > local.lastSavedMs ? 'cloud' : 'local';
}

// --- Datenpfad -------------------------------------------------------------
export type PullResult =
  | { kind: 'ok'; state: GameState }
  | { kind: 'missing' } //  Spieler hat (noch) keinen Cloud-Save.
  | { kind: 'error' }; //   Netz-/Deserialisier-Fehler -> Cloud NICHT anfassen.

/** Cloud-Save des eingeloggten Spielers ziehen (RLS filtert auf die eigene Zeile). */
export async function pullCloud(): Promise<PullResult> {
  if (!supabase) return { kind: 'error' };
  const { data, error } = await supabase.from(TABLE).select('payload').maybeSingle();
  if (error) return { kind: 'error' };
  if (!data?.payload) return { kind: 'missing' };
  try {
    const raw = typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload);
    const s = deserialize(raw); // GameState | null bei korruptem Payload
    return s ? { kind: 'ok', state: s } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** Aktuellen State in die Cloud upserten. payload = kanonisches save.ts-Format. */
export async function pushCloud(state: GameState): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false };
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return { ok: false, error: 'not signed in' };
  // lastSavedMs auf den Push-Zeitpunkt stempeln, damit Cloud-Tiebreak konsistent ist.
  let payload: unknown;
  try {
    payload = JSON.parse(serialize({ ...state, lastSavedMs: Date.now() }));
  } catch {
    return { ok: false, error: 'serialize failed' };
  }
  // total_earned ist denormalisiert/NICHT autoritativ. number kann riesige bigints
  // verlieren -> dann null (kein falscher Wert).
  const t = Number(state.totalEarnedScaled);
  const total = Number.isSafeInteger(t) ? t : null;
  const { error } = await supabase.from(TABLE).upsert({ user_id: userId, payload, total_earned: total });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// --- Orchestrierung --------------------------------------------------------
export type SyncTarget = {
  getState(): GameState;
  /** Cloud-Save lokal übernehmen (commit + localStorage, OHNE Cloud-Re-Upload). */
  adopt(s: GameState): void;
};

export type CloudSync = {
  /** Vom Save-Pfad aufrufen: plant einen debounced Upload (nur als Spieler). */
  notifySaved(): void;
};

/** Aktuelle User-ID aus dem Auth-Store (Session-Token für Race-Schutz). */
function currentPlayerId(): string | null {
  const a = get(auth);
  return a.status === 'player' ? a.userId : null;
}

export function attachCloudSync(target: SyncTarget): CloudSync {
  let isPlayer = false;
  let reconciledForSession = false;
  let reconciling = false;
  let dirtyDuringReconcile = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleUpload(): void {
    if (!isPlayer) return;
    if (reconciling) {
      dirtyDuringReconcile = true; //  Upload erst NACH dem Reconcile, einmal.
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (currentPlayerId()) void pushCloud(target.getState());
    }, DEBOUNCE_MS);
  }

  async function reconcile(sessionId: string): Promise<void> {
    reconciling = true;
    dirtyDuringReconcile = false;
    try {
      const res = await pullCloud();
      // Nach jedem await: ist es noch dieselbe Session/derselbe Spieler?
      if (currentPlayerId() !== sessionId) return;
      if (res.kind === 'error') return; //          Cloud nicht anfassen.
      if (res.kind === 'missing') {
        await pushCloud(target.getState()); //       erster Cloud-Save.
        return;
      }
      if (chooseNewer(target.getState(), res.state) === 'cloud') {
        target.adopt(res.state); //                  ohne Cloud-Re-Upload (siehe game.ts).
      } else {
        await pushCloud(target.getState());
      }
    } finally {
      reconciling = false;
      if (dirtyDuringReconcile && currentPlayerId()) scheduleUpload();
    }
  }

  auth.subscribe((a) => {
    const nowPlayer = a.status === 'player';
    if (nowPlayer && !isPlayer && !reconciledForSession && a.userId) {
      reconciledForSession = true;
      void reconcile(a.userId);
    }
    if (!nowPlayer) {
      reconciledForSession = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    isPlayer = nowPlayer;
  });

  return { notifySaved: scheduleUpload };
}
