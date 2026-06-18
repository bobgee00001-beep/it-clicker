# IT Clicker v2 — Design & Architektur

> State-of-the-art Idle Clicker für ITler. Browser-basiert, Multi-User, zum Verteilen in einer Firmenabteilung.
> Kanonischer Plan. Gehärtet nach Codex-Sparring (gpt-5.5/high, 2026-06-13) — siehe Abschnitt unten.

## Vision
Idle/Incremental-Game mit IT-Theming (CPU Cycles, Server, Tickets/SLA, SEV1, Cloud, AI/Quantum, IPO-Prestige). Im Browser spielbar, Login pro Kollege, kompetitives Leaderboard über die Abteilung.

## Locked Decisions
- **Basis:** Rebuild auf Vite + Svelte + TypeScript. Vorgänger (vanilla Single-File-`index.html`) nur Referenz.
- **Login:** Magic-Link E-Mail via Supabase.
- **Leaderboard-Integrität:** **Pragmatischer Mittelweg** — server-validierte signierte Snapshots + Anomalie-Erkennung statt vollem Action-Sourcing. „Ehrlich genug" für die Abteilung, Tage statt Wochen. Architektur bleibt so geschnitten, dass Voll-Autorität später nachrüstbar ist.
- **Numerik:** Autoritativer Pfad = kanonische **Integer-/Fixed-Point**-Schicht (skalierte BigInt), deterministisch. `break_infinity.js` **nur fürs Display**, sickert nicht in Server-Invarianten.
- **Engine/UI-Invariante:** Die Engine besitzt die Simulation-Clock und ist deterministisch. **Keine Spiel-Logik in Svelte-Stores** — UI interpoliert nur. Kein SvelteKit (statisch reicht).

## Game-Design-Schichten ("state of the art")
Kern-Loop: Klick → Währung → Generatoren → Upgrades → Prestige-Reset → stärker zurück. Darauf:
1. **Zahlen-Skalierung** — Display via `break_infinity.js`, benannte Großzahlen.
2. **Prestige-Layer** — gestaffelt (z.B. IPO → Acquisition → Unicorn), je eigene Meta-Währung.
3. **Automation** — späte Upgrades kaufen/klicken automatisch. **Nur online aktiv** (siehe Offline-Whitelist).
4. **Juice** — Partikel, Zahlen-Pop-ups, Sound-Layer, Screen-Shake bei SEV1.
5. **Soziales** — Leaderboard, Team-/Abteilungswertung, Wochen-Events.

Einspeiser: Tickets/SLA/SEV1 (aktiver Boost/Risiko), Offline-Earnings (Comeback-Belohnung), Achievements (dauerhafte Boni).

## Architektur
**Kernprinzip:** Spiel-Logik = pures, deterministisches TS (`engine/`), strikt getrennt von der UI. Engine läuft client (Preview) UND server (Validierung).

| Ebene | Wahl | Rolle |
|---|---|---|
| Frontend | Vite + Svelte + TS | reaktive UI, nur Interpolation/Preview |
| Game-Engine | pures TS-Paket, framework-frei, deterministisch | geteilt client/server; Integer-Numerik |
| Display-Numerik | `break_infinity.js` | nur Anzeige |
| Backend/Auth | Supabase (Postgres + Auth + RLS) | Magic-Link-Auth, Cloud-Save, Leaderboard |
| Server-Validierung | Supabase Edge Functions (Deno/TS) + Postgres-RPC | prüft Snapshots, schreibt Scores |
| Hosting | Vercel | statisches Frontend |
| Save | localStorage (Cache) + Supabase-Sync | offline spielbar, geräteübergreifend |

## Leaderboard & Integrität (Mittelweg)
- Client rechnet optimistisch (Preview-Engine). Periodisch + bei Prestige postet er einen **signierten Snapshot** `{score, seq, client_time, prev_hash}`.
- Server validiert **billig**: monotone Sequenz, plausible Wachstumsrate seit letztem Snapshot (Obergrenze aus Engine-Parametern), Server-Zeit-Deltas, Replay-Schutz via `seq` + Idempotency-Key.
- **Leaderboard** = materialisierte Scores aus validierten Snapshots (keine Live-Ableitung aus rohem State).
- Auffällige Snapshots → flaggen/verwerfen, nicht hart vertrauen. Kein voller Re-Sim, aber genug für Gelegenheits-Cheater.
- **Offline-Whitelist (hart):** Offline produzieren **nur passive Generatoren**, deterministisch. KEINE Auto-Buyer, keine Achievement-Trigger, keine Zufalls-Tickets/SEV1 während Offline. Offline-Earnings = closed-form über passive Rate × Δt, gekappt.

## Daten (Skizze)
`profiles` · `saves` (state jsonb, seq, last_evaluated_at) · `score_snapshots` (validiert) · `leaderboard` (materialisiert). RLS: jeder nur eigener Save; Leaderboard read-only.

## Codex-Sparring (gpt-5.5/high, 2026-06-13) — Ergebnisse
Adversarial Review gegen diesen Plan. Übernommene Erkenntnisse:
1. **Closed-Form nur für analytisch integrierbare Segmente.** Aktive Mechaniken offline → piecewise Simulation. → Gelöst per harter Offline-Whitelist (nur passiv) + Checkpoints.
2. **Numerik nicht blind über break_infinity validieren** (FP-Divergenz client/server). → Kanonische Integer-Schicht autoritativ, break_infinity nur Display.
3. **Svelte ok, aber Risiko = Logik in Stores.** → Engine/UI-Invariante.
4. **Größtes unterschätztes Risiko: Concurrency/Double-Spend** (stateless Edge Functions, zwei Requests gegen alten Snapshot). → Im Mittelweg via `seq`/Idempotency + serialisierbarer RPC für Score-Writes; im Voll-Ausbau echtes Action-Sourcing.
5. **Fehlte komplett:** Action/Snapshot-Schema mit Versionierung, Determinismus-Testmatrix, Save-/Engine-Migration, Threat-Model, Offline-Whitelist. → Als Protokoll-Punkte aufgenommen.

Urteil Codex: machbar, aber Game-Design bewusst auf berechenbare Segmente beschränken, sonst wird „Closed Form" verstecktes Tick-Replay.

## Roadmap
1. **Fundament** — Vite/Svelte/TS-Gerüst, deterministisches Engine-Skelett (Tick, Integer-Währung, 1 Generator), localStorage-Save, break_infinity nur Display. Lauffähiger Prototyp.
2. **Spiel-Tiefe** — Generatoren, Upgrades, 1 Prestige-Layer, Offline-Earnings (passiv/closed-form), Achievements, Juice.
3. **Multi-User** — Supabase Magic-Link-Auth, Cloud-Save-Sync, Snapshot-Leaderboard + Anomalie-Checks.
4. **Politur** — 2./3. Prestige-Layer, Automation (nur online), Events/Team-Wertung, Balancing-Pass.

## Offene Punkte
- Supabase-Projekt anlegen (Phase 3).
- Determinismus-Testmatrix definieren (Golden-Tests Node/Deno/Browser für Kaufkosten, Prestige-Schwellen, Score-Sortierung).
- Save-/Engine-Versionsmigration skizzieren.
- Konkrete Balancing-Kurven (Kostenwachstum, Produktion, Prestige-Formel).
