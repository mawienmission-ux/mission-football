# World Football

An Expo mobile app for football fixtures and historical league standings. Admin-managed leagues, clubs, seasons, fixtures, scores, points tables, and club/league logos are stored in Supabase. Scores and standings are entered manually; the app does not include a live football data feed or play-by-play event feed.

## Run the app

1. Install Node.js LTS and run `npm install`.
2. Create a Supabase project.
3. In Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
4. Copy [`.env.example`](./.env.example) to `.env` and set the project URL and publishable (anon) key from Supabase **Project Settings → API**.
5. Run `npm start` and open the project in Expo Go or an Android emulator.

The publishable key is intended for client apps; Row Level Security in the schema protects writes. Never put a Supabase `service_role` key in the app or `.env`.
For EAS cloud builds, also add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables; local `.env` files are intentionally excluded from version control.

## Create the first administrator

1. In Supabase **Authentication → Users**, create an admin account with an email and password.
2. Copy that user's UUID.
3. In SQL Editor, run this statement with the UUID and display name:

   ```sql
   insert into public.admin_users (user_id, display_name)
   values ('YOUR-AUTH-USER-UUID', 'Football Admin');
   ```

The admin account can sign in from the app's **Admin** tab. Administrators can change their display name and password there. Admin access is granted only through `admin_users`; signing up or signing in does not grant admin privileges.

## Admin workflow

- Create leagues and clubs, then add league seasons and fixtures.
- Set a fixture's status to scheduled, live, or finished and update its score/minute. The Home screen displays admin-entered fixtures.
- Add each club to a season's standings and enter played, wins, draws, losses, goals, and points. The public **Table** tab sorts by points, goal difference, goals scored, and club name.
- Edit or delete catalog and standings entries from the Admin tab.
- Save a league or club first, then upload its logo. PNG, JPEG, and WebP images up to 5 MB are accepted.
- Public users can read football data and logos. Only authenticated active admins can write data or upload/delete logos.

## Android publishing

The project includes EAS profiles for an internal APK and a production Android App Bundle. Before the first store build, verify that `com.mmissionfootball.worldfootball` is an application ID you own; Android IDs must be globally unique and cannot be changed after release. Then set up an Expo account, EAS environment variables, and Android signing credentials and run `npx eas-cli build --platform android --profile production`. Google Play submission additionally requires your own developer account, store listing, app artwork, and signing setup. This workspace does not have access to an Expo, Google Play, or Supabase account, so it cannot submit or publish the app on your behalf.
