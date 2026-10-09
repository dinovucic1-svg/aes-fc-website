alter table public.aesfc_regulars
add column if not exists guaranteed_games text[] not null default '{}'::text[];

alter table public.aesfc_games
add column if not exists is_active boolean not null default true;

alter table public.aesfc_games
add column if not exists game_status text not null default 'active';

create table if not exists public.aesfc_fixture_exceptions (
  slot_date date primary key,
  reason text not null default 'manual',
  replacement_game_id uuid references public.aesfc_games(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aesfc_fixture_exceptions enable row level security;

drop policy if exists aesfc_fixture_exceptions_public_access on public.aesfc_fixture_exceptions;

create policy aesfc_fixture_exceptions_public_access
on public.aesfc_fixture_exceptions
for all
to anon
using (true)
with check (true);

update public.aesfc_regulars
set guaranteed_games = array['monday', 'wednesday']
where guaranteed_signup = true
  and coalesce(array_length(guaranteed_games, 1), 0) = 0;

update public.aesfc_games
set
  is_active = false,
  game_status = 'removed'
where game_date = date '2026-10-09'
  or (
    game_date >= date '2026-10-09'
    and extract(isodow from game_date)::int = 6
  );

insert into public.aesfc_fixture_exceptions (slot_date, reason, updated_at)
select game_date, 'removed', now()
from public.aesfc_games
where game_status = 'removed'
on conflict (slot_date) do update
set reason = excluded.reason,
    updated_at = excluded.updated_at;

create or replace function public.aesfc_signup_open_for_game(p_game_date date)
returns timestamptz
language sql
stable
as $$
  select (((p_game_date - (extract(isodow from p_game_date)::int - 1)) - 2)::timestamp + time '09:00')
    at time zone 'Europe/Zagreb';
$$;

create or replace function public.aesfc_ensure_weekly_games_and_guarantees()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_today date := (now() at time zone 'Europe/Zagreb')::date;
  base_monday date := local_today - (extract(isodow from local_today)::int - 1);
  schedule_start date := date '2026-10-12';
begin
  insert into public.aesfc_games (
    game_date,
    start_time,
    end_time,
    location_name,
    location_url,
    signup_opens_at,
    is_recurring,
    is_active,
    game_status,
    guest_delay_hours
  )
  select
    game_date,
    start_time,
    end_time,
    location_name,
    location_url,
    public.aesfc_signup_open_for_game(game_date),
    true,
    true,
    'active',
    24
  from (
    select
      base_monday + (week_offset * 7) + day_offset as game_date,
      start_time::time,
      end_time::time,
      location_name,
      location_url
    from generate_series(0, 10) as week_offset
    cross join (
      values
        (0, '20:00', '21:00', 'Bili''s Pitch', 'https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8'),
        (2, '21:00', '22:00', 'Gusar', 'https://www.google.com/maps/search/?api=1&query=Gusar%20Split'),
        (4, '20:00', '21:00', 'Gusar', 'https://www.google.com/maps/search/?api=1&query=Gusar%20Split')
    ) as slots(day_offset, start_time, end_time, location_name, location_url)
  ) target_games
  where game_date >= greatest(local_today, schedule_start)
    and not exists (
      select 1
      from public.aesfc_fixture_exceptions exception
      where exception.slot_date = target_games.game_date
    )
  on conflict (game_date) do nothing;

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
    selected.game_id,
    gen_random_uuid(),
    split_part(selected.full_name, ' ', 1),
    coalesce(nullif(regexp_replace(selected.full_name, '^\S+\s*', ''), ''), ''),
    selected.nationality,
    'not-collected@aesfc.local',
    'not collected',
    1,
    case
      when selected.rn <= 12 then 'Guaranteed signup'
      else 'Guaranteed signup - capacity conflict, listed as sub'
    end,
    null,
    'no',
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    selected.signup_opens_at + ((selected.rn - 1) || ' milliseconds')::interval
  from (
    select
      g.id as game_id,
      g.signup_opens_at,
      r.full_name,
      r.nationality,
      row_number() over (partition by g.id order by r.full_name) as rn
    from public.aesfc_games g
    join lateral (
      select case extract(isodow from g.game_date)::int
        when 1 then 'monday'
        when 3 then 'wednesday'
        when 5 then 'friday'
        else ''
      end as day_key
    ) game_day on true
    join public.aesfc_regulars r on r.is_active = true
    where game_day.day_key <> ''
      and now() >= g.signup_opens_at
      and now() < ((g.game_date::timestamp + g.end_time) at time zone 'Europe/Zagreb')
      and g.is_active is not false
      and coalesce(g.game_status, 'active') = 'active'
      and (
        (
          coalesce(array_length(r.guaranteed_games, 1), 0) > 0
          and game_day.day_key = any(r.guaranteed_games)
        )
        or (
          coalesce(array_length(r.guaranteed_games, 1), 0) = 0
          and r.guaranteed_signup = true
          and game_day.day_key in ('monday', 'wednesday')
        )
      )
      and not exists (
        select 1
        from public.aesfc_signups s
        where s.game_id = g.id
          and lower(trim(s.first_name || ' ' || coalesce(s.last_name, ''))) = lower(trim(r.full_name))
      )
  ) selected;
end;
$$;

select public.aesfc_ensure_weekly_games_and_guarantees();

-- Optional scheduler setup for Supabase projects with pg_cron enabled.
-- This runs often and lets the function decide what is due in Europe/Zagreb time,
-- so daylight saving time changes do not require changing the cron expression.
do $$
begin
  execute 'create extension if not exists pg_cron with schema extensions';
  begin
    execute 'select cron.unschedule(''aesfc-weekly-signup-release'')';
  exception
    when others then null;
  end;
  execute format(
    'select cron.schedule(%L, %L, %L)',
    'aesfc-weekly-signup-release',
    '*/15 * * * *',
    'select public.aesfc_ensure_weekly_games_and_guarantees();'
  );
exception
  when others then
    raise notice 'pg_cron scheduler was not configured automatically: %', SQLERRM;
end $$;

notify pgrst, 'reload schema';
