alter table public.aesfc_player_profiles
add column if not exists profile_tags jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
