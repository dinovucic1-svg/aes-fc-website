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

create or replace function public.aesfc_clean_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.aesfc_full_name(p_first_name text, p_last_name text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''), '\s+', ' ', 'g'));
$$;

create or replace function public.aesfc_public_signups(p_game_id uuid, p_include_cancelled boolean default false)
returns table (
  id uuid,
  game_id uuid,
  first_name text,
  last_name text,
  nationality text,
  created_at timestamptz,
  cancelled_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.game_id,
    s.first_name,
    s.last_name,
    s.nationality,
    s.created_at,
    s.cancelled_at
  from public.aesfc_signups s
  join public.aesfc_games g on g.id = s.game_id
  where s.game_id = p_game_id
    and s.cancelled_at is null
    and coalesce(g.game_status, 'active') <> 'removed'
  order by s.created_at asc, s.id asc;
$$;

create or replace function public.aesfc_public_signup_counts(p_game_ids uuid[])
returns table (
  game_id uuid,
  signup_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id as game_id,
    count(s.id)::bigint as signup_count
  from public.aesfc_games g
  left join public.aesfc_signups s
    on s.game_id = g.id
   and s.cancelled_at is null
  where g.id = any(coalesce(p_game_ids, '{}'::uuid[]))
  group by g.id;
$$;

create or replace function public.aesfc_public_signup(
  p_game_id uuid,
  p_players jsonb,
  p_signup_password text default null
)
returns setof public.aesfc_signups
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.aesfc_games%rowtype;
  signup_group_id uuid := gen_random_uuid();
  cancel_token_value text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  now_value timestamptz := now();
  allow_guest boolean := false;
begin
  if coalesce(p_signup_password, '') <> '2015' then
    raise exception 'Wrong signup password.';
  end if;

  if p_players is null or jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) < 1 or jsonb_array_length(p_players) > 12 then
    raise exception 'Choose between 1 and 12 players.';
  end if;

  select *
  into target_game
  from public.aesfc_games
  where id = p_game_id
  for update;

  if not found or target_game.is_active is false or coalesce(target_game.game_status, 'active') <> 'active' then
    raise exception 'This game is not open for signup.';
  end if;

  if now_value < target_game.signup_opens_at then
    raise exception 'Signup is not open yet.';
  end if;

  if now_value >= ((target_game.game_date::timestamp + target_game.end_time) at time zone 'Europe/Zagreb') then
    raise exception 'Signup is closed for this game.';
  end if;

  allow_guest := now_value >= target_game.signup_opens_at + ((coalesce(target_game.guest_delay_hours, 24) || ' hours')::interval);

  if exists (
    select 1
    from jsonb_array_elements(p_players) with ordinality as player(value, ord)
    where public.aesfc_clean_name(player.value->>'full_name') = ''
      or public.aesfc_clean_name(player.value->>'full_name') !~ '\S+\s+\S+'
  ) then
    raise exception 'Please use full first and last names.';
  end if;

  if exists (
    select 1
    from (
      select public.aesfc_clean_name(value->>'full_name') as full_name
      from jsonb_array_elements(p_players)
    ) requested
    group by requested.full_name
    having count(*) > 1
  ) then
    raise exception 'A player is listed more than once in this signup.';
  end if;

  if not allow_guest and exists (
    select 1
    from jsonb_array_elements(p_players) player(value)
    where not exists (
      select 1
      from public.aesfc_regulars r
      where r.is_active = true
        and public.aesfc_clean_name(r.full_name) = public.aesfc_clean_name(player.value->>'full_name')
    )
  ) then
    raise exception 'Guest/manual names open after the priority window.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_players) player(value)
    join public.aesfc_signups s
      on s.game_id = p_game_id
     and s.cancelled_at is null
     and public.aesfc_clean_name(public.aesfc_full_name(s.first_name, s.last_name)) = public.aesfc_clean_name(player.value->>'full_name')
  ) then
    raise exception 'One of these players is already signed up for this game.';
  end if;

  return query
  insert into public.aesfc_signups (
    game_id,
    signup_group,
    first_name,
    last_name,
    nationality,
    email,
    phone,
    player_count,
    comments,
    signed_up_by,
    played_before,
    cancel_token,
    created_at
  )
  select
    p_game_id,
    signup_group_id,
    split_part(cleaned.full_name, ' ', 1),
    coalesce(nullif(regexp_replace(cleaned.full_name, '^\S+\s*', ''), ''), ''),
    coalesce(nullif(trim(cleaned.nationality), ''), ''),
    'not-collected@aesfc.local',
    'not collected',
    1,
    nullif(trim(cleaned.comments), ''),
    nullif(trim(cleaned.signed_up_by), ''),
    'no',
    cancel_token_value,
    now_value + ((cleaned.ord - 1) || ' milliseconds')::interval
  from (
    select
      ord,
      regexp_replace(trim(value->>'full_name'), '\s+', ' ', 'g') as full_name,
      coalesce(value->>'nationality', '') as nationality,
      coalesce(value->>'comments', '') as comments,
      coalesce(value->>'signed_up_by', '') as signed_up_by
    from jsonb_array_elements(p_players) with ordinality as player(value, ord)
  ) cleaned
  order by cleaned.ord
  returning *;
end;
$$;

create or replace function public.aesfc_public_cancel_signup(p_signup_id uuid, p_cancel_token text)
returns setof public.aesfc_signups
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group uuid;
begin
  select signup_group
  into target_group
  from public.aesfc_signups
  where id = p_signup_id
    and cancel_token = coalesce(p_cancel_token, '')
    and cancelled_at is null
  for update;

  if target_group is null then
    raise exception 'This cancellation link is invalid or the signup was already cancelled.';
  end if;

  return query
  update public.aesfc_signups
  set cancelled_at = now()
  where signup_group = target_group
    and cancel_token = coalesce(p_cancel_token, '')
    and cancelled_at is null
  returning *;
end;
$$;

create or replace function public.aesfc_admin_update_game_schedule(
  p_game_id uuid,
  p_original_game_date date,
  p_game_date date,
  p_start_time time,
  p_end_time time,
  p_location_name text,
  p_location_url text,
  p_signup_opens_at timestamptz,
  p_is_active boolean,
  p_game_status text,
  p_is_recurring boolean
)
returns public.aesfc_games
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_game public.aesfc_games%rowtype;
begin
  if not public.aesfc_is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if p_game_date is null or p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception 'Invalid schedule row.';
  end if;

  update public.aesfc_games
  set
    game_date = p_game_date,
    start_time = p_start_time,
    end_time = p_end_time,
    location_name = nullif(trim(p_location_name), ''),
    location_url = nullif(trim(p_location_url), ''),
    signup_opens_at = p_signup_opens_at,
    is_active = coalesce(p_is_active, true),
    game_status = case when coalesce(p_is_active, true) then 'active' else coalesce(nullif(p_game_status, ''), 'skipped') end,
    is_recurring = coalesce(p_is_recurring, true)
  where id = p_game_id
  returning * into saved_game;

  if not found then
    raise exception 'Game not found.';
  end if;

  if p_original_game_date is not null and p_original_game_date <> p_game_date then
    insert into public.aesfc_fixture_exceptions (slot_date, reason, replacement_game_id, updated_at)
    values (p_original_game_date, 'moved', p_game_id, now())
    on conflict (slot_date) do update
    set reason = excluded.reason,
        replacement_game_id = excluded.replacement_game_id,
        updated_at = excluded.updated_at;
  end if;

  if saved_game.is_active is false or coalesce(saved_game.game_status, 'active') <> 'active' then
    insert into public.aesfc_fixture_exceptions (slot_date, reason, replacement_game_id, updated_at)
    values (saved_game.game_date, coalesce(saved_game.game_status, 'skipped'), p_game_id, now())
    on conflict (slot_date) do update
    set reason = excluded.reason,
        replacement_game_id = excluded.replacement_game_id,
        updated_at = excluded.updated_at;
  elsif p_original_game_date = p_game_date then
    delete from public.aesfc_fixture_exceptions where slot_date = p_game_date;
  end if;

  return saved_game;
end;
$$;

create or replace function public.aesfc_admin_remove_game(p_game_id uuid)
returns public.aesfc_games
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_game public.aesfc_games%rowtype;
begin
  if not public.aesfc_is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  update public.aesfc_games
  set is_active = false,
      game_status = 'removed'
  where id = p_game_id
  returning * into saved_game;

  if not found then
    raise exception 'Game not found.';
  end if;

  insert into public.aesfc_fixture_exceptions (slot_date, reason, replacement_game_id, updated_at)
  values (saved_game.game_date, 'removed', p_game_id, now())
  on conflict (slot_date) do update
  set reason = excluded.reason,
      replacement_game_id = excluded.replacement_game_id,
      updated_at = excluded.updated_at;

  return saved_game;
end;
$$;

revoke all on function public.aesfc_public_signups(uuid, boolean) from public;
revoke all on function public.aesfc_public_signup_counts(uuid[]) from public;
revoke all on function public.aesfc_public_signup(uuid, jsonb, text) from public;
revoke all on function public.aesfc_public_cancel_signup(uuid, text) from public;
revoke all on function public.aesfc_admin_update_game_schedule(uuid, date, date, time, time, text, text, timestamptz, boolean, text, boolean) from public;
revoke all on function public.aesfc_admin_remove_game(uuid) from public;

grant execute on function public.aesfc_public_signups(uuid, boolean) to anon, authenticated;
grant execute on function public.aesfc_public_signup_counts(uuid[]) to anon, authenticated;
grant execute on function public.aesfc_public_signup(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.aesfc_public_cancel_signup(uuid, text) to anon, authenticated;
grant execute on function public.aesfc_admin_update_game_schedule(uuid, date, date, time, time, text, text, timestamptz, boolean, text, boolean) to authenticated;
grant execute on function public.aesfc_admin_remove_game(uuid) to authenticated;
grant execute on function public.aesfc_ensure_weekly_games_and_guarantees() to anon, authenticated;

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
drop policy if exists aesfc_games_public_read on public.aesfc_games;
drop policy if exists aesfc_signups_public_read on public.aesfc_signups;
drop policy if exists aesfc_signups_public_insert on public.aesfc_signups;
drop policy if exists aesfc_signups_public_cancel on public.aesfc_signups;
drop policy if exists aesfc_photos_public_read on public.aesfc_photos;
drop policy if exists aesfc_settings_public_read on public.aesfc_settings;
drop policy if exists aesfc_regulars_public_read on public.aesfc_regulars;
drop policy if exists aesfc_player_profiles_public_read on public.aesfc_player_profiles;
drop policy if exists aesfc_results_public_read on public.aesfc_results;
drop policy if exists aesfc_tracker_drafts_admin_read on public.aesfc_tracker_drafts;
drop policy if exists aesfc_fixture_exceptions_admin_read on public.aesfc_fixture_exceptions;
drop policy if exists aesfc_games_admin_write on public.aesfc_games;
drop policy if exists aesfc_signups_admin_write on public.aesfc_signups;
drop policy if exists aesfc_photos_admin_write on public.aesfc_photos;
drop policy if exists aesfc_settings_admin_write on public.aesfc_settings;
drop policy if exists aesfc_regulars_admin_write on public.aesfc_regulars;
drop policy if exists aesfc_player_profiles_admin_write on public.aesfc_player_profiles;
drop policy if exists aesfc_results_admin_write on public.aesfc_results;
drop policy if exists aesfc_tracker_drafts_admin_write on public.aesfc_tracker_drafts;
drop policy if exists aesfc_fixture_exceptions_admin_write on public.aesfc_fixture_exceptions;

create policy aesfc_games_public_read on public.aesfc_games
for select to anon, authenticated
using (true);

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
