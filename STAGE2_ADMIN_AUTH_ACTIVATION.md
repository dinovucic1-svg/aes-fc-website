# AES FC Stage 2 Admin Auth Activation

This branch prepares secure admin access and constrained public signup writes, but it does not run migrations or deploy anything by itself.

## Activation Sequence

1. Deploy the Stage 2 source only after the database migrations below are ready to run.
2. In Supabase SQL Editor, run `aesfc-simple-setup.sql` if the base schema is not already current.
3. Run `aesfc-weekly-schedule-guarantees.sql` to install the Saturday 09:00 Europe/Zagreb weekly generator and fixture-exception table.
4. Create a Supabase Auth user for the admin account in Supabase Authentication.
5. Run `aesfc-admin-auth-rls.sql`.
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

8. Deploy the source to Netlify.
9. In Supabase, verify the scheduler exists and is enabled:

```sql
select * from cron.job where jobname = 'aesfc-weekly-signup-release';
```

## What Changes

- Public users can read public site data but cannot directly insert or update signup rows.
- Public signup goes through `public.aesfc_public_signup(...)`, which validates game status, signup opening time, guest-delay rules, duplicate names and duplicate active signups server-side.
- Public cancellation goes through `public.aesfc_public_cancel_signup(...)`, which requires the signup's private cancel token.
- Admin writes require Supabase Auth plus membership in `public.aesfc_admin_users`.
- Schedule edits and fixture exceptions are written atomically through `public.aesfc_admin_update_game_schedule(...)`.
- Removed games are marked and exception-recorded atomically through `public.aesfc_admin_remove_game(...)`.

## Live Verification Needed

These checks require a test Supabase project or a careful production maintenance window:

- Confirm anonymous direct `insert/update` on `public.aesfc_signups` is rejected.
- Confirm anonymous `aesfc_public_signup` succeeds only after signup opens and rejects duplicates/early guest signups.
- Confirm anonymous `aesfc_public_cancel_signup` rejects missing/wrong tokens and cancels with the correct token.
- Confirm authenticated non-admin users cannot call admin RPCs.
- Confirm authenticated admin users can save schedule edits, remove games and write admin data.
- Confirm repeated scheduler runs do not recreate moved, skipped or removed fixture dates.
