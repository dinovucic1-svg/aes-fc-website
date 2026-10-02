# AES FC Weekly Football Signup Website: Simple Deployment Guide

This guide uses two websites:

- Supabase for the database.
- Netlify Drop for the clickable live website.

You do not need Terminal, npm, GitHub, migrations, or environment variables.

## What is already built

The website folder includes:

- Public signup page for Wednesday 9:00 PM football.
- Game schedule that opens each sheet Saturday at 9:00 AM Europe/Zagreb.
- Playing list for the first 12 timestamped player spots.
- Unlimited Subs list.
- Automatic promotion when someone cancels or an admin removes them.
- Secure private cancellation links.
- Admin dashboard protected by a simple password.
- Admin editing/removal of signups.
- Admin editing/removal of regular player name options.
- Admin photo add/remove tools.
- Homepage slideshow, photo grid, and lightbox.
- Match Videos section with your YouTube channel link.
- Placeholder photos in `public/photos`.

## Part 1: Create the database in Supabase

1. Open this website:
   `https://supabase.com`

2. Click:
   `Start your project`

3. Sign in or create an account.

4. Click:
   `New project`

5. For `Project name`, paste:
   `aes-fc-signup`

6. For `Database Password`, click:
   `Generate a password`

7. For `Region`, choose the closest European option available.

8. Click:
   `Create new project`

9. Wait until Supabase finishes creating the project.

10. In the left sidebar, click:
    `SQL Editor`

11. Click:
    `New query`

12. Open the file named:
    `1-COPY-THIS-INTO-SUPABASE.txt`

13. Copy all text from that file.

14. Paste it into the Supabase SQL editor.

15. Click:
    `Run`

16. Wait for Supabase to finish. If you see “Success”, the database is ready.

17. In the left sidebar, click the gear icon:
    `Project Settings`

18. Click:
    `API`

19. Find `Project URL`.

20. Copy the full Project URL.

21. Find `Project API keys`.

22. Copy the key named:
    `anon public`

23. Come back to ChatGPT and paste:

```text
Supabase Project URL:
PASTE_THE_PROJECT_URL_HERE

Supabase anon public key:
PASTE_THE_ANON_PUBLIC_KEY_HERE
```

When you come back with those two values, ChatGPT can put them into `config.js` for you and make the final upload-ready website zip.

## Part 2: Deploy the website on Netlify Drop

Do this after `config.js` has your real Supabase URL and anon public key.

1. Open this website:
   `https://app.netlify.com/drop`

2. Sign in or create a free Netlify account if asked.

   Netlify’s Free plan is enough for this website. The one-hour warning appears when you use Netlify Drop without an account. Creating a free account keeps the website online.

3. Double-click the file:
   `aes-fc-signup-website.zip`

4. This creates a folder named:
   `aes-fc-signup-website`

5. On the Netlify page, find the upload box.

6. Drag the folder named `aes-fc-signup-website` into the upload box.

7. Wait for Netlify to finish.

8. Netlify will show a live website link.

9. Click that link to open the AES FC website.

10. Come back to ChatGPT and paste the live website link.

## Part 3: First admin login

1. Open your live website.

2. Click:
   `Admin`

3. For `Admin password`, paste:
   `AESfc2015`

4. Click:
   `Open admin`

5. Share this admin password only with Dino, Michael, Miro, and Igor.

## Part 4: Add real photos

Simple admin method:

1. Open your live website.

2. Click:
   `Admin`

3. Log in with the admin password.

4. Under `Add or remove photos`, click:
   `Choose File`

5. Select a football photo from your computer.

6. Add a title.

7. Click:
   `Add photo`

Project-folder method:

1. Put real photo files inside:
   `public/photos`

2. Use simple file names, for example:
   `wednesday-game-1.jpg`

3. In the admin dashboard, paste this as the photo path:
   `public/photos/wednesday-game-1.jpg`

4. Click:
   `Add photo`

## Part 5: Add or replace YouTube videos as admin

The YouTube channel button already points here:

`https://www.youtube.com/@dinovucic239/videos`

To show embedded match videos:

1. Open your live website.

2. Click:
   `Admin`

3. Enter the admin password:
   `AESfc2015`

4. Under `Signup rules text`, find:
   `YouTube video links or IDs`

5. Paste one YouTube video link or video ID per line.

Example:

If the video link is:

`https://www.youtube.com/watch?v=ABC123xyz`

Paste only this part:

`ABC123xyz`

6. Click:
   `Save text and videos`

Until real video IDs are added, the website shows only the YouTube channel button.

## Part 6: How players use it

1. Dino, Igor, Michael, or Miro shares the private website link.

2. Players enter the signup password:
   `2015`

3. Players choose their full name from the regulars list, or choose `Not listed - enter manually`.

4. If someone signs up extra players, they choose each extra player from the list, or enter a full name manually.

5. Every player gets their own visible list spot.

6. The first 12 player spots show as:
   `Playing`

7. Later player spots show as:
   `Sub`

8. After signup, the person submitting sees a private cancellation link.

9. If someone cancels, the earliest Sub automatically moves into Playing.

## Part 7: Change game details as admin

1. Open your live website.

2. Click:
   `Admin`

3. Enter the admin password:
   `AESfc2015`

4. Click:
   `Open admin`

5. Under `Game details`, change the date, start time, end time, location name, or location link.

6. Click:
   `Save game details`

## Part 8: Change signup rules text as admin

1. Open your live website.

2. Click:
   `Admin`

3. Enter the admin password:
   `AESfc2015`

4. Under `Signup rules text`, edit the title or text.

5. Click:
   `Save text and videos`

## Part 9: Change regular player name options as admin

1. Open your live website.

2. Click:
   `Admin`

3. Enter the admin password:
   `AESfc2015`

4. Under `Regular player names`, add, edit, or remove names.

5. The public signup dropdown updates automatically.

## Important notes

- Email and phone are no longer collected.
- Signup order is based on timestamp.
- Status is calculated from the current order, not manually stored.
- The public signup sheet opens Saturday at 9:00 AM Europe/Zagreb.
- The game is Wednesday from 9:00 PM to 10:00 PM.
