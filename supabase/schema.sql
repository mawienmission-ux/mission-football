create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
      and is_active
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  region text not null check (region in ('Europe', 'Americas', 'Asia', 'Africa', 'Oceania')),
  logo_path text,
  created_at timestamptz not null default now(),
  constraint leagues_name_country_unique unique (name, country)
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  country text not null,
  logo_path text,
  created_at timestamptz not null default now(),
  constraint clubs_name_country_unique unique (name, country)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint seasons_league_name_unique unique (league_id, name),
  constraint seasons_id_league_unique unique (id, league_id)
);

create table if not exists public.standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  played integer not null default 0 check (played >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  goals_for integer not null default 0 check (goals_for >= 0),
  goals_against integer not null default 0 check (goals_against >= 0),
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now(),
  constraint standings_season_club_unique unique (season_id, club_id),
  constraint standings_results_fit_played check (wins + draws + losses <= played)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid,
  home_club_id uuid not null references public.clubs(id) on delete cascade,
  away_club_id uuid not null references public.clubs(id) on delete cascade,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'finished')),
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  minute integer check (minute is null or minute between 0 and 150),
  created_at timestamptz not null default now(),
  constraint matches_different_clubs check (home_club_id <> away_club_id),
  constraint matches_season_belongs_to_league
    foreign key (season_id, league_id)
    references public.seasons(id, league_id)
    on delete cascade
);

create index if not exists seasons_league_id_idx on public.seasons (league_id);
create index if not exists standings_season_points_idx
  on public.standings (season_id, points desc);
create index if not exists matches_kickoff_idx on public.matches (kickoff_at);

alter table public.admin_users enable row level security;
alter table public.leagues enable row level security;
alter table public.clubs enable row level security;
alter table public.seasons enable row level security;
alter table public.standings enable row level security;
alter table public.matches enable row level security;

drop policy if exists "Admins can read admin accounts" on public.admin_users;
create policy "Admins can read admin accounts"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins can update own profile" on public.admin_users;
create policy "Admins can update own profile"
  on public.admin_users for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()))
  with check (user_id = (select auth.uid()) and (select public.is_admin()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['leagues', 'clubs', 'seasons', 'standings', 'matches']
  loop
    execute format('drop policy if exists %I on public.%I', 'public_read_' || table_name, table_name);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', 'public_read_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admin_insert_' || table_name, table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', 'admin_insert_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admin_update_' || table_name, table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', 'admin_update_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admin_delete_' || table_name, table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', 'admin_delete_' || table_name, table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('football-logos', 'football-logos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view football logos" on storage.objects;
create policy "Public can view football logos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'football-logos');

drop policy if exists "Admins can upload football logos" on storage.objects;
create policy "Admins can upload football logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'football-logos' and (select public.is_admin()));

drop policy if exists "Admins can update football logos" on storage.objects;
create policy "Admins can update football logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'football-logos' and (select public.is_admin()))
  with check (bucket_id = 'football-logos' and (select public.is_admin()));

drop policy if exists "Admins can delete football logos" on storage.objects;
create policy "Admins can delete football logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'football-logos' and (select public.is_admin()));

grant select on public.leagues, public.clubs, public.seasons, public.standings, public.matches to anon, authenticated;
grant insert, update, delete on public.leagues, public.clubs, public.seasons, public.standings, public.matches to authenticated;
grant select on public.admin_users to authenticated;
grant update (display_name) on public.admin_users to authenticated;
