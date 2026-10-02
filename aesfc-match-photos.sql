alter table public.aesfc_results
add column if not exists team_a_photo_url text not null default '';

alter table public.aesfc_results
add column if not exists team_b_photo_url text not null default '';

notify pgrst, 'reload schema';
