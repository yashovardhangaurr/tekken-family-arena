create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  match_type text not null check (match_type in ('1v1','2v2')),
  played_at timestamptz not null default now(),
  venue text not null check (venue in ('Parth''s Akhada','Yatharth''s Combat','Mishra Arena')),
  team1_score int not null default 0 check (team1_score >= 0),
  team2_score int not null default 0 check (team2_score >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  team smallint not null check (team in (1,2)),
  character text,
  unique(match_id, player_id)
);

create table if not exists match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  game_no int not null,
  player1_id uuid not null references players(id) on delete restrict,
  player2_id uuid not null references players(id) on delete restrict,
  player1_score int not null default 0 check (player1_score >= 0),
  player2_score int not null default 0 check (player2_score >= 0),
  winner_id uuid references players(id) on delete restrict,
  player1_character text,
  player2_character text,
  unique(match_id, game_no)
);

create table if not exists match_edits (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  edited_at timestamptz not null default now(),
  editor text,
  before_data jsonb,
  after_data jsonb
);

alter table players enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table match_games enable row level security;
alter table match_edits enable row level security;

-- This app intentionally has no login. Anyone who can access the app can edit data.
-- Keep the app URL private if you don't want strangers to modify the family database.
create policy "public all players" on players for all using (true) with check (true);
create policy "public all matches" on matches for all using (true) with check (true);
create policy "public all match players" on match_players for all using (true) with check (true);
create policy "public all match games" on match_games for all using (true) with check (true);
create policy "public all match edits" on match_edits for all using (true) with check (true);
