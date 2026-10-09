# AES FC Stage 2 Activation Guide

This branch prepares secure admin access, constrained public signup writes and the Saturday 09:00 Europe/Zagreb weekly release. It does not deploy the site or run production migrations by itself.

## Required Order

1. Create or choose a Supabase test project first, if possible.
2. Run `aesfc-simple-setup.sql` only if the base AES FC schema is not already current.
3. Run `aesfc-weekly-schedule-guarantees.sql`.
   - This adds `is_active`, `game_status`, day-specific guarantees and fixture exceptions.
   - It removes the mistaken October 9, 2026 game and future Saturday fixtures by marking them removed.
   - It installs `public.aesfc_ensure_weekly_games_and_guarantees()`.
4. Create the Supabase Auth admin user in Authentication.
5. Run `aesfc-admin-auth-rls.sql`.
   - This enables admin membership, constrained public signup/cancel RPCs and RLS policies.
   - It removes broad anonymous write policies on signups, games, results, photos, settings, regulars, player profiles, tracker drafts and fixture exceptions.
6. Add the admin user to `public.aesfc_admin_users`:

```sql
insert into public.aesfc_admin_users (user_id, email)
values ('PASTE_AUTH_USER_ID_HERE', 'you@example.com')
on conflict (user_id) do update set email = excluded.email;
```

7. In `config.js`, set:

```js
adminAuthMode: "supabase"
```

8. Deploy the website source.
9. Confirm the scheduler exists:

```sql
select * from cron.job where jobname = 'aesfc-weekly-signup-release';
```

10. Run this once manually after deployment to confirm the function executes without errors:

```sql
select public.aesfc_ensure_weekly_games_and_guarantees();
```

## What Must Be True Before Release

- Public signup lists come from `public.aesfc_public_signups(...)`, which returns only active signup rows and only the fields the public site needs: signup id, game id, first name, last name, nationality and signup/cancel timestamps.
- Contact details, private comments, player counts, signup groups and cancellation tokens remain admin-only.
- Public signup writes go through `public.aesfc_public_signup(...)`.
- Public cancellation goes through `public.aesfc_public_cancel_signup(...)` and requires the private cancellation token stored on the original browser.
- Existing signups without a local browser token, including automatic guaranteed signups, must be cancelled by an organiser in Admin. The public site explains this fallback without exposing tokens.
- Admin writes require Supabase Auth plus membership in `public.aesfc_admin_users`.
- Schedule edits and fixture exceptions are written atomically through `public.aesfc_admin_update_game_schedule(...)`.
- Removed games are marked and exception-recorded atomically through `public.aesfc_admin_remove_game(...)`.

## Test Checklist

Run these in a test Supabase project before production:

- Anonymous direct `insert`, `update` and `delete` on `public.aesfc_signups` are rejected.
- Anonymous `public.aesfc_public_signup(...)` succeeds only after signup opens.
- Anonymous `public.aesfc_public_signup(...)` rejects duplicate names, duplicate active signups, inactive games, removed games, full playing lists and early guest signups.
- Anonymous `public.aesfc_public_cancel_signup(...)` rejects missing or wrong tokens and cancels only with the correct token.
- Authenticated non-admin users cannot call admin RPCs or write admin tables.
- Authenticated admin users can save schedule edits, remove games and write admin data.
- Saturday October 10, 2026 at 09:00 Europe/Zagreb opens October 12, 14 and 16 together.
- Re-running `public.aesfc_ensure_weekly_games_and_guarantees()` does not duplicate games or registrations.
- Moved, skipped and removed fixture dates stay excluded after repeated generator runs.
- A moved game writes its exception record in the same transaction as the game update.
- Batch schedule saves retain failed draft rows and report affected dates.
- Batch player saves retain failed draft rows and report affected players.

## Current Local Verification Note

This checkout is connected to a live Supabase project that has not yet run the Stage 2 RPC migration. The local page currently reports missing RPCs such as `public.aesfc_public_signup_counts(p_game_ids)`, which is expected until the activation sequence above is completed. Do not use that live project as the test environment unless you intentionally schedule a production maintenance window.
