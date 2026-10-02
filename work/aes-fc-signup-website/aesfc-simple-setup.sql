create table if not exists public.aesfc_games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null unique,
  start_time time not null default '21:00',
  end_time time not null default '22:00',
  location_name text not null default 'NK Bili As ADB Pitch',
  location_url text not null default 'https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8',
  signup_opens_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.aesfc_signups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.aesfc_games(id) on delete cascade,
  signup_group uuid not null default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  email text not null,
  phone text not null,
  player_count int not null default 1,
  comments text,
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

alter table public.aesfc_games enable row level security;
alter table public.aesfc_signups enable row level security;
alter table public.aesfc_photos enable row level security;

drop policy if exists aesfc_games_public_access on public.aesfc_games;
drop policy if exists aesfc_signups_public_access on public.aesfc_signups;
drop policy if exists aesfc_photos_public_access on public.aesfc_photos;

create policy aesfc_games_public_access
on public.aesfc_games
for all
to anon
using (true)
with check (true);

create policy aesfc_signups_public_access
on public.aesfc_signups
for all
to anon
using (true)
with check (true);

create policy aesfc_photos_public_access
on public.aesfc_photos
for all
to anon
using (true)
with check (true);

insert into public.aesfc_photos (title, url, caption, sort_order)
select 'Placeholder photo 1', 'public/photos/aes-placeholder-1.svg', 'Replace this with a real AES FC game photo.', 10
where not exists (select 1 from public.aesfc_photos where url = 'public/photos/aes-placeholder-1.svg');

insert into public.aesfc_photos (title, url, caption, sort_order)
select 'Placeholder photo 2', 'public/photos/aes-placeholder-2.svg', 'Upload real photos in public/photos or add them in the admin dashboard.', 20
where not exists (select 1 from public.aesfc_photos where url = 'public/photos/aes-placeholder-2.svg');

insert into public.aesfc_photos (title, url, caption, sort_order)
select 'Placeholder photo 3', 'public/photos/aes-placeholder-3.svg', 'Click any photo to open the lightbox.', 30
where not exists (select 1 from public.aesfc_photos where url = 'public/photos/aes-placeholder-3.svg');
