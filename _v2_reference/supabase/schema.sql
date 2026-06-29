-- ============================================================================
-- IT-Clicker v2 — Phase 3, Slice 1: Auth + Cloud-Save (invite-gated)
-- Anwenden im Supabase SQL Editor (Project: bobgee00001-beep's Project).
-- Idempotent — mehrfach ausführbar. Gehärtet nach Codex-Review (gpt-5.5/high).
--
-- Sicherheitsmodell:
--   - Login per Magic-Link (beliebige Mail) — KEINE Domain-Beschränkung.
--   - GATE = Invite-Code: nur redeem_invite(code) mit aktivem Code legt eine
--     players-Zeile an. Ohne players-Zeile => RLS blockt jeden Save.
--   - invite_codes verwaltest DU (Dashboard/SQL). Clients können sie weder
--     lesen noch schreiben (RLS an, keine Policy).
--   - Codex-Härtung: saves hängt per FK an players (keine verwaisten Saves);
--     search_path='' in SECURITY DEFINER; players client-seitig read-only;
--     payload-Größencheck; optional max_uses/expires_at am Code.
-- ============================================================================

-- 1) Invite-Codes — von Georg kontrolliert. Wiederverwendbar, widerrufbar.
--    expires_at / max_uses sind OPTIONAL (NULL = unbegrenzt) -> einfaches
--    Modell als Default, aber kappbar/ablaufbar wenn ein Link mal leakt.
create table if not exists public.invite_codes (
  code        text primary key,
  label       text,
  active      boolean not null default true,
  max_uses    integer,                       -- NULL = unbegrenzt
  uses_count  integer not null default 0,
  expires_at  timestamptz,                   -- NULL = kein Ablauf
  created_at  timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
-- KEINE Policy => kein Client-Zugriff (Codes nicht lesbar/enumerierbar).

-- 2) Players — Existenz einer Zeile = eingeladen & spielberechtigt.
--    NUR von redeem_invite() anlegbar. Client-seitig READ-ONLY (kein Update,
--    damit invited_via/created_at nicht manipulierbar sind).
create table if not exists public.players (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  invited_via  text references public.invite_codes(code),
  created_at   timestamptz not null default now()
);
alter table public.players enable row level security;

drop policy if exists players_select_own on public.players;
create policy players_select_own on public.players
  for select using (auth.uid() = user_id);
-- Bewusst KEIN insert/update/delete-Policy: niemand macht/ändert sich selbst.
-- (display_name-Pflege kommt später über eine eng begrenzte RPC.)

-- 3) Saves — ein Cloud-Save pro Spieler. payload = kanonisches save.ts-Format.
--    FK auf players (nicht auth.users): eine Save kann NICHT ohne Spieler
--    existieren; Player gelöscht -> Save kaskadiert weg (kein stale read).
--    Größencheck gegen Payload-Spam (Clicker-Save ist wenige KB; 256 KB üppig).
create table if not exists public.saves (
  user_id      uuid primary key references public.players(user_id) on delete cascade,
  payload      jsonb not null,
  total_earned numeric,        -- denormalisiert (Konflikt-Heuristik); NICHT autoritativ
  updated_at   timestamptz not null default now(),
  constraint saves_payload_size check (pg_column_size(payload) <= 262144)
);
alter table public.saves enable row level security;
-- WICHTIG: per Migration (nicht Dashboard) erstellte Tabellen bekommen KEINE
-- automatischen Grants. Ohne das gibt PostgREST 403 für die authenticated-Rolle
-- (RLS sitzt drauf, aber die Rolle darf die Tabelle gar nicht erst ansprechen).
-- RLS bleibt die Datengrenze; der Grant erlaubt nur den Zugriffsversuch.
grant select, insert, update, delete on table public.saves to authenticated;

drop policy if exists saves_select_own on public.saves;
create policy saves_select_own on public.saves
  for select using (auth.uid() = user_id);

-- Schreiben (insert/update/delete) NUR eigene Zeile UND nur als Spieler.
drop policy if exists saves_modify_own on public.saves;
create policy saves_modify_own on public.saves
  for all
  using (
    auth.uid() = user_id
    and exists (select 1 from public.players p where p.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.players p where p.user_id = auth.uid())
  );

-- 4) redeem_invite(code) — der einzige Weg, Spieler zu werden.
--    SECURITY DEFINER, search_path='' (alle Objekte voll qualifiziert).
--    Atomarer uses_count-Increment mit allen Guards in EINEM UPDATE
--    (active + nicht abgelaufen + max_uses nicht erreicht) -> race-frei.
create or replace function public.redeem_invite(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Bereits Spieler? Idempotenter Erfolg, Code wird nicht verbraucht.
  if exists (select 1 from public.players where user_id = auth.uid()) then
    return true;
  end if;
  -- Code atomar prüfen + verbrauchen. Greift nur, wenn aktiv, nicht abgelaufen
  -- und (max_uses NULL oder noch frei). Liefert eine Zeile bei Erfolg.
  update public.invite_codes
     set uses_count = uses_count + 1
   where code = p_code
     and active = true
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses_count < max_uses)
  returning true into v_ok;
  if v_ok is not true then
    return false;  -- unbekannt / deaktiviert / abgelaufen / aufgebraucht
  end if;
  insert into public.players (user_id, invited_via)
    values (auth.uid(), p_code)
    on conflict (user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

-- 5) is_player() — Client-Statuscheck.
create or replace function public.is_player()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.players where user_id = auth.uid());
$$;
revoke all on function public.is_player() from public;
grant execute on function public.is_player() to authenticated;

-- 6) updated_at automatisch pflegen — auch bei INSERT (Client kann nicht fälschen).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- NACH dem Anwenden: ersten Invite-Code anlegen. LANG + ZUFÄLLIG wählen
-- (der Code ist ein Bearer-Token — wer ihn hat, kann sich einladen).
--   insert into public.invite_codes (code, label)
--     values ('team-7f3a91c2e8', 'Abteilung Rollout');
-- Optional kappen/ablaufen:  ... (code, label, max_uses, expires_at)
--     values ('team-...', 'Rollout', 50, now() + interval '30 days');
-- Widerrufen:  update public.invite_codes set active=false where code='team-...';
-- Invite-Link:  https://<app-url>/?invite=team-7f3a91c2e8
-- ============================================================================
