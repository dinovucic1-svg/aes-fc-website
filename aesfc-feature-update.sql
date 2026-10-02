alter table public.aesfc_signups add column if not exists signed_up_by text;
alter table public.aesfc_regulars add column if not exists guaranteed_signup boolean not null default false;
alter table public.aesfc_results add column if not exists game_flow text not null default '';
alter table public.aesfc_results add column if not exists youtube_url text not null default '';

insert into public.aesfc_regulars (full_name, guaranteed_signup)
values ('Dino Vučić', true)
on conflict (full_name) do update
set guaranteed_signup = excluded.guaranteed_signup;

update public.aesfc_regulars
set guaranteed_signup = true
where full_name in ('Igor Sadovoi', 'Miro Bandalo', 'Dino Vučić', 'Michael Freer');
