-- Optional hardening migration for authenticated AES FC admin access.
-- Run this only after:
-- 1. Creating at least one Supabase Auth user for the admin.
-- 2. Inserting that user's auth.users.id into public.aesfc_admin_users below.
-- 3. Setting window.AES_CONFIG.adminAuthMode = "supabase" in config.js.

create table if not exists public.aesfc_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.aesfc_fixture_exceptions (
  slot_date date primary key,
  reason text not null default 'manual',
  replacement_game_id uuid references public.aesfc_games(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aesfc_admin_users enable row level security;
alter table public.aesfc_fixture_exceptions enable row level security;

create or replace function public.aesfc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.aesfc_admin_users admin_user
    where admin_user.user_id = auth.uid()
  );
$$;

revoke all on function public.aesfc_is_admin() from public;
grant execute on function public.aesfc_is_admin() to authenticated;

drop policy if exists aesfc_admin_users_self_read on public.aesfc_admin_users;
create policy aesfc_admin_users_self_read
on public.aesfc_admin_users
for select
to authenticated
using (user_id = auth.uid());

-- Replace broad anonymous admin-like policies with public read + authenticated admin writes.
drop policy if exists aesfc_games_public_access on public.aesfc_games;
drop policy if exists aesfc_signups_public_access on public.aesfc_signups;
drop policy if exists aesfc_photos_public_access on public.aesfc_photos;
drop policy if exists aesfc_settings_public_access on public.aesfc_settings;
drop policy if exists aesfc_regulars_public_access on public.aesfc_regulars;
drop policy if exists aesfc_player_profiles_public_access on public.aesfc_player_profiles;
drop policy if exists aesfc_results_public_access on public.aesfc_results;
drop policy if exists aesfc_tracker_drafts_public_access on public.aesfc_tracker_drafts;
drop policy if exists aesfc_fixture_exceptions_public_access on public.aesfc_fixture_exceptions;

create policy aesfc_games_public_read on public.aesfc_games
for select to anon, authenticated
using (true);

create policy aesfc_signups_public_read on public.aesfc_signups
for select to anon, authenticated
using (true);

create policy aesfc_signups_public_insert on public.aesfc_signups
for insert to anon, authenticated
with check (true);

create policy aesfc_signups_public_cancel on public.aesfc_signups
for update to anon, authenticated
using (true)
with check (true);

create policy aesfc_photos_public_read on public.aesfc_photos
for select to anon, authenticated
using (true);

create policy aesfc_settings_public_read on public.aesfc_settings
for select to anon, authenticated
using (true);

create policy aesfc_regulars_public_read on public.aesfc_regulars
for select to anon, authenticated
using (true);

create policy aesfc_player_profiles_public_read on public.aesfc_player_profiles
for select to anon, authenticated
using (true);

create policy aesfc_results_public_read on public.aesfc_results
for select to anon, authenticated
using (true);

create policy aesfc_tracker_drafts_admin_read on public.aesfc_tracker_drafts
for select to authenticated
using (public.aesfc_is_admin());

create policy aesfc_fixture_exceptions_admin_read on public.aesfc_fixture_exceptions
for select to authenticated
using (public.aesfc_is_admin());

create policy aesfc_games_admin_write on public.aesfc_games
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_signups_admin_write on public.aesfc_signups
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_photos_admin_write on public.aesfc_photos
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_settings_admin_write on public.aesfc_settings
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_regulars_admin_write on public.aesfc_regulars
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_player_profiles_admin_write on public.aesfc_player_profiles
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_results_admin_write on public.aesfc_results
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_tracker_drafts_admin_write on public.aesfc_tracker_drafts
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

create policy aesfc_fixture_exceptions_admin_write on public.aesfc_fixture_exceptions
for all to authenticated
using (public.aesfc_is_admin())
with check (public.aesfc_is_admin());

-- After creating an auth user, add them as admin with:
-- insert into public.aesfc_admin_users (user_id, email)
-- values ('PASTE_AUTH_USER_ID_HERE', 'you@example.com')
-- on conflict (user_id) do update set email = excluded.email;

notify pgrst, 'reload schema';
