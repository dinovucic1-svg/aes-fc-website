drop function if exists public.aes_admin_change_password(text, text);
drop function if exists public.aes_admin_remove_photo(text, uuid);
drop function if exists public.aes_admin_add_photo(text, text, text, text);
drop function if exists public.aes_admin_update_game(text, date, time, time, text, text);
drop function if exists public.aes_admin_update_signup(text, uuid, text, text, text, text, int, text, text, text);
drop function if exists public.aes_admin_remove_signup(text, uuid);
drop function if exists public.aes_admin_state(text);
drop function if exists public.aes_cancel_signup(uuid, text);
drop function if exists public.aes_submit_signup(text, text, text, text, int, text, text, text);
drop function if exists public.aes_public_state();
drop function if exists public.aes_ranked_signups(uuid);
drop function if exists public.aes_ensure_current_game();
drop function if exists public.aes_sheet_window();
drop function if exists public.aes_admin_ok(text);

drop table if exists public.aes_signups cascade;
drop table if exists public.aes_games cascade;
drop table if exists public.aes_photos cascade;
drop table if exists public.aes_admin_settings cascade;

create table public.aes_admin_settings (
  id boolean primary key default true,
  admin_password text not null,
  updated_at timestamptz not null default now(),
  constraint one_admin_settings_row check (id)
);

insert into public.aes_admin_settings (id, admin_password)
values (true, 'AESfc2015');

create table public.aes_games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null unique,
  start_time time not null default '21:00',
  end_time time not null default '22:00',
  location_name text not null default 'NK Bili As ADB Pitch',
  location_url text not null default 'https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8',
  signup_opens_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.aes_signups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.aes_games(id) on delete cascade,
  signup_group uuid not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  player_count int not null default 1 check (player_count = 1),
  extra_players text,
  comments text,
  played_before text not null check (played_before in ('yes', 'no')),
  cancel_token text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create table public.aes_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'AES FC photo',
  url text not null,
  caption text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.aes_photos (title, url, caption, sort_order)
values
  ('Placeholder photo 1', 'public/photos/aes-placeholder-1.svg', 'Replace this with a real AES FC game photo.', 10),
  ('Placeholder photo 2', 'public/photos/aes-placeholder-2.svg', 'Upload real photos in public/photos or add them in the admin dashboard.', 20),
  ('Placeholder photo 3', 'public/photos/aes-placeholder-3.svg', 'Click any photo to open the lightbox.', 30);

alter table public.aes_admin_settings enable row level security;
alter table public.aes_games enable row level security;
alter table public.aes_signups enable row level security;
alter table public.aes_photos enable row level security;

create or replace function public.aes_admin_ok(p_admin_password text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.aes_admin_settings
    where id = true
      and admin_password = coalesce(p_admin_password, '')
  );
$$;

create or replace function public.aes_sheet_window()
returns table (
  game_date date,
  signup_opens_at timestamptz,
  signup_closes_at timestamptz,
  is_open boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := timezone('Europe/Zagreb', now());
  local_date date := timezone('Europe/Zagreb', now())::date;
  iso_dow int := extract(isodow from timezone('Europe/Zagreb', now()));
  monday date;
  target_date date;
  opens_at timestamptz;
  closes_at timestamptz;
begin
  monday := local_date - (iso_dow - 1);

  if (iso_dow = 6 and local_now::time >= time '09:00')
     or iso_dow = 7
     or iso_dow in (1, 2)
     or (iso_dow = 3 and local_now::time < time '22:00') then
    if iso_dow in (1, 2, 3) then
      target_date := monday + 2;
    else
      target_date := monday + 9;
    end if;
  else
    target_date := monday + 9;
  end if;

  opens_at := ((target_date - 4)::timestamp + time '09:00') at time zone 'Europe/Zagreb';
  closes_at := (target_date::timestamp + time '22:00') at time zone 'Europe/Zagreb';

  return query select target_date, opens_at, closes_at, now() >= opens_at and now() < closes_at;
end;
$$;

create or replace function public.aes_ensure_current_game()
returns public.aes_games
language plpgsql
security definer
set search_path = public
as $$
declare
  sheet record;
  game public.aes_games;
begin
  select *
  into game
  from public.aes_games g
  where now() < ((g.game_date::timestamp + g.end_time) at time zone 'Europe/Zagreb')
  order by g.signup_opens_at desc, g.created_at desc
  limit 1;

  if game.id is not null then
    return game;
  end if;

  select * into sheet from public.aes_sheet_window() limit 1;

  insert into public.aes_games (game_date, signup_opens_at)
  values (sheet.game_date, sheet.signup_opens_at)
  on conflict (game_date) do update set signup_opens_at = excluded.signup_opens_at
  returning * into game;

  return game;
end;
$$;

create or replace function public.aes_ranked_signups(p_game_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  player_count int,
  extra_players text,
  comments text,
  played_before text,
  created_at timestamptz,
  signup_position bigint,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.first_name,
    s.last_name,
    s.email,
    s.phone,
    s.player_count,
    s.extra_players,
    s.comments,
    s.played_before,
    s.created_at,
    row_number() over (order by s.created_at, s.id) as signup_position,
    case when row_number() over (order by s.created_at, s.id) <= 10 then 'Playing' else 'Sub' end as status
  from public.aes_signups s
  where s.game_id = p_game_id
    and s.cancelled_at is null
  order by s.created_at, s.id;
$$;

create or replace function public.aes_public_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.aes_games;
  sheet record;
begin
  game := public.aes_ensure_current_game();
  select * into sheet from public.aes_sheet_window() limit 1;

  return jsonb_build_object(
    'game', jsonb_build_object(
      'id', game.id,
      'game_date', game.game_date,
      'start_time', game.start_time,
      'end_time', game.end_time,
      'location_name', game.location_name,
      'location_url', game.location_url,
      'signup_opens_at', game.signup_opens_at,
      'signup_closes_at', sheet.signup_closes_at,
      'is_open', sheet.is_open
    ),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'first_name', r.first_name,
        'last_name', r.last_name,
        'player_count', r.player_count,
        'played_before', r.played_before,
        'created_at', r.created_at,
        'position', r.signup_position,
        'status', r.status
      ) order by r.signup_position)
      from public.aes_ranked_signups(game.id) r
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'url', p.url,
        'caption', p.caption,
        'sort_order', p.sort_order
      ) order by p.sort_order, p.created_at)
      from public.aes_photos p
      where p.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.aes_submit_signup(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_player_count int default 1,
  p_extra_players text default '',
  p_comments text default '',
  p_played_before text default 'no'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.aes_games;
  sheet record;
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  group_id uuid := gen_random_uuid();
  base_time timestamptz := now();
  new_signup public.aes_signups;
  signup_status text;
  signup_position bigint;
  requested_count int := coalesce(p_player_count, 1);
  extra_names text[];
  extra_name text;
  name_parts text[];
  inserted_count int := 1;
begin
  game := public.aes_ensure_current_game();
  select * into sheet from public.aes_sheet_window() limit 1;

  if not sheet.is_open then
    raise exception 'Signup is closed. It opens every Saturday at 9:00 AM Europe/Zagreb for the following Wednesday game.';
  end if;

  if nullif(trim(p_first_name), '') is null
    or nullif(trim(p_last_name), '') is null
    or nullif(trim(p_email), '') is null
    or nullif(trim(p_phone), '') is null then
    raise exception 'First name, last name, email, and phone are required.';
  end if;

  if requested_count < 1 or requested_count > 10 then
    raise exception 'Number of players must be between 1 and 10.';
  end if;

  if requested_count > 1 and nullif(trim(coalesce(p_extra_players, '')), '') is null then
    raise exception 'Please include the full names of extra players.';
  end if;

  if requested_count > 1 then
    extra_names := array_remove(regexp_split_to_array(trim(coalesce(p_extra_players, '')), E'\\s*(\\r?\\n|;)\\s*'), '');
    if array_length(extra_names, 1) is null or array_length(extra_names, 1) < requested_count - 1 then
      raise exception 'Please put each extra player on their own line.';
    end if;
  end if;

  insert into public.aes_signups (
    game_id, signup_group, first_name, last_name, email, phone, player_count,
    extra_players, comments, played_before, cancel_token
  )
  values (
    game.id, group_id, trim(p_first_name), trim(p_last_name), trim(p_email), trim(p_phone),
    1, null, nullif(trim(coalesce(p_comments, '')), ''),
    case when p_played_before = 'yes' then 'yes' else 'no' end,
    token
  )
  returning * into new_signup;

  if requested_count > 1 then
    foreach extra_name in array extra_names loop
      exit when inserted_count >= requested_count;
      name_parts := regexp_split_to_array(trim(extra_name), E'\\s+');
      insert into public.aes_signups (
        game_id, signup_group, first_name, last_name, email, phone, player_count,
        extra_players, comments, played_before, cancel_token, created_at
      )
      values (
        game.id,
        group_id,
        trim(extra_name),
        '',
        trim(p_email),
        trim(p_phone),
        1,
        null,
        concat('Signed up by ', trim(p_first_name), ' ', trim(p_last_name), '. ', nullif(trim(coalesce(p_comments, '')), '')),
        case when p_played_before = 'yes' then 'yes' else 'no' end,
        token,
        base_time + (inserted_count * interval '1 millisecond')
      );
      inserted_count := inserted_count + 1;
    end loop;
  end if;

  select r.status, r.signup_position into signup_status, signup_position
  from public.aes_ranked_signups(game.id) r
  where r.id = new_signup.id;

  return jsonb_build_object(
    'signup_id', new_signup.id,
    'cancel_token', token,
    'status', signup_status,
    'position', signup_position,
    'player_count', requested_count
  );
end;
$$;

create or replace function public.aes_cancel_signup(p_signup_id uuid, p_cancel_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  changed int;
begin
  update public.aes_signups
  set cancelled_at = now()
  where signup_group = (
      select signup_group
      from public.aes_signups
      where id = p_signup_id
        and cancel_token = coalesce(p_cancel_token, '')
      limit 1
    )
    and cancelled_at is null
    and cancel_token = coalesce(p_cancel_token, '');

  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'This cancellation link is invalid or the signup was already cancelled.';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.aes_admin_state(p_admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.aes_games;
begin
  if not public.aes_admin_ok(p_admin_password) then
    raise exception 'Wrong admin password.';
  end if;

  game := public.aes_ensure_current_game();

  return jsonb_build_object(
    'game', to_jsonb(game),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'first_name', r.first_name,
        'last_name', r.last_name,
        'email', r.email,
        'phone', r.phone,
        'player_count', r.player_count,
        'extra_players', r.extra_players,
        'comments', r.comments,
        'played_before', r.played_before,
        'created_at', r.created_at,
        'position', r.signup_position,
        'status', r.status
      ) order by r.signup_position)
      from public.aes_ranked_signups(game.id) r
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort_order, p.created_at)
      from public.aes_photos p
      where p.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.aes_admin_update_game(
  p_admin_password text,
  p_game_date date,
  p_start_time time,
  p_end_time time,
  p_location_name text,
  p_location_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.aes_games;
begin
  if not public.aes_admin_ok(p_admin_password) then
    raise exception 'Wrong admin password.';
  end if;

  game := public.aes_ensure_current_game();

  update public.aes_games
  set game_date = p_game_date,
      start_time = p_start_time,
      end_time = p_end_time,
      location_name = trim(p_location_name),
      location_url = trim(p_location_url),
      signup_opens_at = ((p_game_date - 4)::timestamp + time '09:00') at time zone 'Europe/Zagreb'
  where id = game.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.aes_admin_remove_signup(p_admin_password text, p_signup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aes_admin_ok(p_admin_password) then
    raise exception 'Wrong admin password.';
  end if;

  update public.aes_signups
  set cancelled_at = now()
  where id = p_signup_id and cancelled_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.aes_admin_update_signup(
  p_admin_password text,
  p_signup_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_player_count int,
  p_extra_players text,
  p_comments text,
  p_played_before text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aes_admin_ok(p_admin_password) then
    raise exception 'Wrong admin password.';
  end if;

  if nullif(trim(p_first_name), '') is null
    or nullif(trim(p_last_name), '') is null
    or nullif(trim(p_email), '') is null
    or nullif(trim(p_phone), '') is null then
    raise exception 'First name, last name, email, and phone are required.';
  end if;

  if coalesce(p_player_count, 1) > 1 and nullif(trim(coalesce(p_extra_players, '')), '') is null then
    raise exception 'Please include the full names of extra players.';
  end if;

  update public.aes_signups
  set first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      email = trim(p_email),
      phone = trim(p_phone),
      player_count = coalesce(p_player_count, 1),
      extra_players = nullif(trim(coalesce(p_extra_players, '')), ''),
      comments = nullif(trim(coalesce(p_comments, '')), ''),
      played_before = case when p_played_before = 'yes' then 'yes' else 'no' end
  where id = p_signup_id
    and cancelled_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.aes_admin_add_photo(
  p_admin_password text,
  p_title text,
  p_url text,
  p_caption text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aes_admin_ok(p_admin_password) then
    raise exception 'Wrong admin password.';
  end if;

  if nullif(trim(p_url), '') is null then
    raise exception 'Photo path or URL is required.';
  end if;

  insert into public.aes_photos (title, url, caption, sort_order)
  values (
    coalesce(nullif(trim(p_title), ''), 'AES FC photo'),
    trim(p_url),
    nullif(trim(coalesce(p_caption, '')), ''),
    100 + (select count(*)::int from public.aes_photos)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.aes_admin_remove_photo(p_admin_password text, p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aes_admin_ok(p_admin_password) then
    raise exception 'Wrong admin password.';
  end if;

  update public.aes_photos
  set is_active = false
  where id = p_photo_id;

  return jsonb_build_object('ok', true);
end;
$$;
