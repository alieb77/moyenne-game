-- =====================================================================
--  MOYENNE — Reconstruction complète du backend Supabase
--  À coller dans : Supabase Dashboard → SQL Editor → New query → Run
--
--  Reconstruit à partir du code de app/page.js et app/admin/page.js.
--  Crée : tables, contraintes, RLS, Realtime, et la fonction close_round.
--  Idempotent : peut être relancé sans casser (drop if exists en tête).
-- =====================================================================

-- ---------- Nettoyage (si tu relances le script) --------------------
drop function if exists public.close_round(uuid);
drop table if exists public.submissions cascade;
drop table if exists public.rounds      cascade;
drop table if exists public.players     cascade;
drop table if exists public.profiles    cascade;
drop table if exists public.games       cascade;

-- =====================================================================
--  TABLES
-- =====================================================================

-- Parties. L'admin en crée une par "reset". Statut vivant = 'waiting'.
create table public.games (
  id         uuid primary key default gen_random_uuid(),
  status     text not null default 'waiting',   -- 'waiting' | 'active' | 'done'
  created_at timestamptz not null default now()
);

-- Profil = pseudo unique rattaché au compte auth (magic link).
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  created_at timestamptz not null default now()
);

-- Un joueur = une participation d'un compte à une partie.
create table public.players (
  id                  uuid primary key default gen_random_uuid(),
  game_id             uuid not null references public.games(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  username            text not null,
  pv                  numeric not null default 100,
  eliminated          boolean not null default false,
  eliminated_at_round int,
  created_at          timestamptz not null default now(),
  unique (game_id, user_id)
);

-- Rounds d'une partie. average/target remplis à la clôture.
create table public.rounds (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games(id) on delete cascade,
  round_number int  not null,
  status       text not null default 'open',      -- 'open' | 'done'
  average      numeric,
  target       numeric,
  created_at   timestamptz not null default now(),
  unique (game_id, round_number)
);

-- Une soumission = le nombre joué par un joueur à un round.
-- distance_from_average = distance à la CIBLE (rempli à la clôture, malgré le nom).
-- pv_delta = variation de PV appliquée (négatif = dégâts, positif = gain).
create table public.submissions (
  id                    uuid primary key default gen_random_uuid(),
  round_id              uuid not null references public.rounds(id) on delete cascade,
  player_id             uuid not null references public.players(id) on delete cascade,
  number                numeric not null,
  distance_from_average numeric,
  pv_delta              numeric,
  created_at            timestamptz not null default now(),
  unique (round_id, player_id)
);

-- Index utiles
create index on public.players     (game_id);
create index on public.players     (user_id);
create index on public.rounds      (game_id);
create index on public.submissions (round_id);
create index on public.submissions (player_id);

-- =====================================================================
--  FONCTION close_round  (appelée par l'admin : rpc('close_round', ...))
--  SECURITY DEFINER : contourne la RLS pour mettre à jour tous les joueurs.
-- =====================================================================
create or replace function public.close_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round     public.rounds%rowtype;
  v_avg       numeric;
  v_target    numeric;
  v_count_100 int;
  v_has_100   boolean;
  r           record;
  v_distance  numeric;
  v_delta     numeric;
  v_new_pv    numeric;
begin
  -- Round encore ouvert ? (idempotence : ne clôture pas deux fois)
  select * into v_round from public.rounds where id = p_round_id;
  if not found or v_round.status <> 'open' then
    return;
  end if;

  -- Moyenne des nombres soumis
  select avg(number) into v_avg
  from public.submissions where round_id = p_round_id;

  -- Aucun nombre soumis : clôture sèche, sans dégâts
  if v_avg is null then
    update public.rounds
      set status = 'done', average = 0, target = 0
      where id = p_round_id;
    return;
  end if;

  v_target := v_avg * 2.0 / 3.0;

  -- Combien de 100 ? un 100 existe-t-il ? (pour les règles spéciales)
  select count(*) filter (where number = 100),
         bool_or(number = 100)
    into v_count_100, v_has_100
    from public.submissions where round_id = p_round_id;

  -- ---- Joueurs ayant soumis : calcul des dégâts / gains ----
  for r in
    select s.id as sub_id, s.player_id, s.number,
           p.pv as cur_pv
    from public.submissions s
    join public.players p on p.id = s.player_id
    where s.round_id = p_round_id
  loop
    v_distance := abs(r.number - v_target);

    -- Dégâts de base : distance à la cible (moitié si cible > 33.3)
    if v_target > 33.3 then
      v_delta := -(v_distance / 2.0);
    else
      v_delta := -v_distance;
    end if;

    -- Règle du 100 unique : seul joueur à 100 => il GAGNE (cible..100, max 100)
    if v_count_100 = 1 and r.number = 100 then
      v_delta := least(100, greatest(0, 100 - v_target));
    end if;

    -- Règle Double Tranchant : joueur à 0 alors qu'un 100 existe => -20 bonus
    if r.number = 0 and v_has_100 then
      v_delta := v_delta - 20;
    end if;

    v_new_pv := round((r.cur_pv + v_delta)::numeric, 1);
    if v_new_pv < 0 then v_new_pv := 0; end if;

    update public.submissions
      set distance_from_average = round(v_distance, 1),
          pv_delta              = round(v_delta, 1)
      where id = r.sub_id;

    update public.players
      set pv         = v_new_pv,
          eliminated = case when v_new_pv <= 0 then true else eliminated end,
          eliminated_at_round = case
            when v_new_pv <= 0 and eliminated_at_round is null
              then v_round.round_number
            else eliminated_at_round end
      where id = r.player_id;
  end loop;

  -- ---- No-show : joueur actif sans soumission => -20 PV ----
  for r in
    select p.id as player_id, p.pv as cur_pv
    from public.players p
    where p.game_id = v_round.game_id
      and p.eliminated = false
      and not exists (
        select 1 from public.submissions s
        where s.round_id = p_round_id and s.player_id = p.id
      )
  loop
    v_new_pv := r.cur_pv - 20;
    if v_new_pv < 0 then v_new_pv := 0; end if;

    update public.players
      set pv         = v_new_pv,
          eliminated = case when v_new_pv <= 0 then true else eliminated end,
          eliminated_at_round = case
            when v_new_pv <= 0 and eliminated_at_round is null
              then v_round.round_number
            else eliminated_at_round end
      where id = r.player_id;
  end loop;

  -- ---- Clôture du round ----
  update public.rounds
    set status  = 'done',
        average = round(v_avg, 2),
        target  = round(v_target, 2)
    where id = p_round_id;
end;
$$;

grant execute on function public.close_round(uuid) to anon, authenticated;

-- =====================================================================
--  ROW LEVEL SECURITY
--  NB : la page /admin utilise la même clé anon (pas de service_role),
--  donc les insert/delete de games & rounds sont ouverts. Acceptable
--  pour un jeu entre camarades ; le mot de passe admin est côté client.
-- =====================================================================
alter table public.profiles    enable row level security;
alter table public.games       enable row level security;
alter table public.players     enable row level security;
alter table public.rounds      enable row level security;
alter table public.submissions enable row level security;

-- profiles : lecture publique, création de son propre profil
create policy profiles_select      on public.profiles for select using (true);
create policy profiles_insert_own  on public.profiles for insert with check (auth.uid() = id);

-- games : lecture + gestion (admin depuis le client)
create policy games_select on public.games for select using (true);
create policy games_insert on public.games for insert with check (true);
create policy games_update on public.games for update using (true) with check (true);
create policy games_delete on public.games for delete using (true);

-- rounds : lecture + gestion (admin lance/clôture/reset)
create policy rounds_select on public.rounds for select using (true);
create policy rounds_insert on public.rounds for insert with check (true);
create policy rounds_update on public.rounds for update using (true) with check (true);
create policy rounds_delete on public.rounds for delete using (true);

-- players : lecture publique, s'inscrit soi-même, reset admin (delete)
create policy players_select     on public.players for select using (true);
create policy players_insert_own on public.players for insert
  with check (auth.uid() = user_id);
create policy players_delete     on public.players for delete using (true);

-- submissions : lecture publique, soumet pour son propre joueur, reset (delete)
create policy submissions_select on public.submissions for select using (true);
create policy submissions_insert_own on public.submissions for insert
  with check (exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  ));
create policy submissions_delete on public.submissions for delete using (true);

-- =====================================================================
--  REALTIME  (le client s'abonne aux changements de ces 4 tables)
-- =====================================================================
-- Payload complet sur les UPDATE (payload.new lu entièrement côté client)
alter table public.players replica identity full;
alter table public.rounds  replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.games;       exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.rounds;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.submissions; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
--  Partie de départ (pour que /admin trouve tout de suite une game)
-- =====================================================================
insert into public.games (status) values ('waiting');

-- Fin. ✅
