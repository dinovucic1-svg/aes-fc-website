create table if not exists public.aesfc_games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null unique,
  start_time time not null default '21:00',
  end_time time not null default '22:00',
  location_name text not null default 'NK Bili As ADB Pitch',
  location_url text not null default 'https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8',
  signup_opens_at timestamptz not null,
  is_recurring boolean not null default true,
  is_active boolean not null default true,
  game_status text not null default 'active',
  guest_delay_hours int not null default 24,
  created_at timestamptz not null default now()
);

create table if not exists public.aesfc_signups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.aesfc_games(id) on delete cascade,
  signup_group uuid not null default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  nationality text not null default '',
  email text not null,
  phone text not null,
  player_count int not null default 1,
  comments text,
  signed_up_by text,
  played_before text not null default 'no',
  cancel_token text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create table if not exists public.aesfc_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'AES FC photo',
  url text not null,
  caption text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.aesfc_settings (
  id boolean primary key default true,
  rules_title text not null default 'Signup rules',
  rules_text text not null,
  hero_photo_url text not null default '',
  youtube_channel_url text not null default 'https://www.youtube.com/@dinovucic239/videos',
  youtube_video_ids text not null default '',
  updated_at timestamptz not null default now(),
  constraint one_aesfc_settings_row check (id)
);

create table if not exists public.aesfc_regulars (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  nationality text not null default '',
  is_active boolean not null default true,
  guaranteed_signup boolean not null default false,
  guaranteed_games text[] not null default '{}'::text[],
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.aesfc_player_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  nationality text not null default '',
  profile_tags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aesfc_results (
  id uuid primary key default gen_random_uuid(),
  game_date date not null unique,
  team_a_players text[] not null default '{}',
  team_b_players text[] not null default '{}',
  team_a_score int not null default 0,
  team_b_score int not null default 0,
  player_stats jsonb not null default '{}'::jsonb,
  game_flow text not null default '',
  youtube_url text not null default '',
  team_a_photo_url text not null default '',
  team_b_photo_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.aesfc_tracker_drafts (
  game_date date primary key,
  draft_data jsonb not null default '{}'::jsonb,
  is_finished boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.aesfc_fixture_exceptions (
  slot_date date primary key,
  reason text not null default 'manual',
  replacement_game_id uuid references public.aesfc_games(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aesfc_signups add column if not exists email text not null default 'not-collected@aesfc.local';
alter table public.aesfc_signups add column if not exists phone text not null default 'not collected';
alter table public.aesfc_signups add column if not exists signed_up_by text;
alter table public.aesfc_signups add column if not exists nationality text not null default '';
alter table public.aesfc_regulars add column if not exists nationality text not null default '';
alter table public.aesfc_regulars add column if not exists guaranteed_signup boolean not null default false;
alter table public.aesfc_regulars add column if not exists guaranteed_games text[] not null default '{}'::text[];
update public.aesfc_regulars
set guaranteed_games = array['monday', 'wednesday']
where guaranteed_signup = true
  and coalesce(array_length(guaranteed_games, 1), 0) = 0;
alter table public.aesfc_games add column if not exists is_recurring boolean not null default true;
alter table public.aesfc_games add column if not exists is_active boolean not null default true;
alter table public.aesfc_games add column if not exists game_status text not null default 'active';
alter table public.aesfc_games add column if not exists guest_delay_hours int not null default 24;
alter table public.aesfc_results add column if not exists player_stats jsonb not null default '{}'::jsonb;
alter table public.aesfc_results add column if not exists game_flow text not null default '';
alter table public.aesfc_results add column if not exists youtube_url text not null default '';
alter table public.aesfc_results add column if not exists team_a_photo_url text not null default '';
alter table public.aesfc_results add column if not exists team_b_photo_url text not null default '';
alter table public.aesfc_tracker_drafts add column if not exists is_finished boolean not null default false;
alter table public.aesfc_tracker_drafts add column if not exists updated_at timestamptz not null default now();

alter table public.aesfc_games enable row level security;
alter table public.aesfc_signups enable row level security;
alter table public.aesfc_photos enable row level security;
alter table public.aesfc_settings enable row level security;
alter table public.aesfc_regulars enable row level security;
alter table public.aesfc_player_profiles enable row level security;
alter table public.aesfc_results enable row level security;
alter table public.aesfc_tracker_drafts enable row level security;
alter table public.aesfc_fixture_exceptions enable row level security;

drop policy if exists aesfc_games_public_access on public.aesfc_games;
drop policy if exists aesfc_signups_public_access on public.aesfc_signups;
drop policy if exists aesfc_photos_public_access on public.aesfc_photos;
drop policy if exists aesfc_settings_public_access on public.aesfc_settings;
drop policy if exists aesfc_regulars_public_access on public.aesfc_regulars;
drop policy if exists aesfc_player_profiles_public_access on public.aesfc_player_profiles;
drop policy if exists aesfc_results_public_access on public.aesfc_results;
drop policy if exists aesfc_tracker_drafts_public_access on public.aesfc_tracker_drafts;
drop policy if exists aesfc_fixture_exceptions_public_access on public.aesfc_fixture_exceptions;
drop policy if exists aesfc_games_public_read on public.aesfc_games;
drop policy if exists aesfc_signups_public_read on public.aesfc_signups;
drop policy if exists aesfc_signups_public_insert on public.aesfc_signups;
drop policy if exists aesfc_signups_public_cancel on public.aesfc_signups;
drop policy if exists aesfc_photos_public_read on public.aesfc_photos;
drop policy if exists aesfc_settings_public_read on public.aesfc_settings;
drop policy if exists aesfc_regulars_public_read on public.aesfc_regulars;
drop policy if exists aesfc_player_profiles_public_read on public.aesfc_player_profiles;
drop policy if exists aesfc_results_public_read on public.aesfc_results;

create policy aesfc_games_public_read
on public.aesfc_games
for select
to anon, authenticated
using (true);

create policy aesfc_photos_public_read
on public.aesfc_photos
for select
to anon, authenticated
using (true);

create policy aesfc_settings_public_read
on public.aesfc_settings
for select
to anon, authenticated
using (true);

create policy aesfc_regulars_public_read
on public.aesfc_regulars
for select
to anon, authenticated
using (true);

create policy aesfc_player_profiles_public_read
on public.aesfc_player_profiles
for select
to anon, authenticated
using (true);

create policy aesfc_results_public_read
on public.aesfc_results
for select
to anon, authenticated
using (true);

alter table public.aesfc_settings
  add column if not exists hero_photo_url text not null default '';

insert into public.aesfc_settings (id, rules_title, rules_text, hero_photo_url, youtube_channel_url, youtube_video_ids)
values (
  true,
  'Signup rules',
  'Only Dino, Igor, Michael and Miro can share the signup sheet link. If you have access to the signup link, please keep it private. This helps us know who has access, keep contact details available, and manage updates properly.

Signups go live every Saturday at 9:00 AM Europe/Zagreb for the following week’s Monday, Wednesday and Friday games.

Please give regulars from our WhatsApp group the first chance to sign up in the first 24 hours of the signup sheet being posted. After the 24 hours, you have the green light for people to sign up additional players.

Please do not share the link with others. If you are signing someone else up, sign them up yourself and include their name in the comments section.

Anyone you sign up is your responsibility. If they, or you, cannot play, tell us and make an effort to find a replacement.',
  '',
  'https://www.youtube.com/@dinovucic239/videos',
  ''
)
on conflict (id) do nothing;

insert into public.aesfc_regulars (full_name, sort_order)
select name, row_number() over ()
from (
  values
    ('Agustin Fontanilla'),
    ('Amar Musić'),
    ('Andrii Frolov'),
    ('Anđelo Šetka'),
    ('Anthony Derro'),
    ('David Folis'),
    ('Dino Vučić'),
    ('Emanuel Andjelic'),
    ('Flo Psaïla'),
    ('George Penn'),
    ('Igor Sadovoi'),
    ('Ilya Gurman'),
    ('Ionut Copoiu'),
    ('Ivan Nuić'),
    ('Ivan Sarmiento'),
    ('Liam Wallace'),
    ('Lovre Rogulj'),
    ('Lucho Cvitanić'),
    ('Luka Marasović'),
    ('Luka Zovko'),
    ('Maks Jurić'),
    ('Mate Parlov'),
    ('Matt Moyers'),
    ('Max Lipanov'),
    ('Michael Freer'),
    ('Mikita Hrutsa'),
    ('Miro Bandalo'),
    ('Mislav Penović'),
    ('Nick Hathaway'),
    ('Nicholas Skific'),
    ('Niko Antunovich'),
    ('Predrag Lazarevski'),
    ('Simone Bianconi'),
    ('Tomislav Radić'),
    ('Vojko Mladinić'),
    ('Wladi')
) as regulars(name)
where not exists (
  select 1
  from public.aesfc_regulars existing
  where existing.full_name = regulars.name
)
on conflict (full_name) do nothing;

insert into public.aesfc_photos (title, url, caption, sort_order)
select 'Placeholder photo 1', 'public/photos/aes-placeholder-1.svg', 'Replace this with a real AES FC game photo.', 10
where not exists (select 1 from public.aesfc_photos where url = 'public/photos/aes-placeholder-1.svg');

insert into public.aesfc_photos (title, url, caption, sort_order)
select 'Placeholder photo 2', 'public/photos/aes-placeholder-2.svg', 'Upload real photos in public/photos or add them in the admin dashboard.', 20
where not exists (select 1 from public.aesfc_photos where url = 'public/photos/aes-placeholder-2.svg');

insert into public.aesfc_photos (title, url, caption, sort_order)
select 'Placeholder photo 3', 'public/photos/aes-placeholder-3.svg', 'Click any photo to open the lightbox.', 30
where not exists (select 1 from public.aesfc_photos where url = 'public/photos/aes-placeholder-3.svg');
