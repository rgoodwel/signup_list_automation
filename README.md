# Signup List Automation (Golf League)

This React + Vite app implements a weekly golf-league signup system. It stores groups of players (names only) in browser localStorage and includes rules to form and manage groups for play across 9 holes.

Key features implemented

- Enforced first and last name for every player entry.
- Dynamic additional player fields (click the + to add up to 3 extra players). No comma-delimited lists.
- Names-only entries. Each player is stored as a single string (first and last name).
- Grouping logic:
  - Groups are capped at 4 players.
  - Individual signups are placed into the first existing group with space, otherwise a new group is created.
  - Multi-player signups create or merge groups automatically. Merges are rejected if the result would exceed 4 players.
  - Name matching is case-insensitive and whitespace-normalized.
- Admins and permissions:
  - A small list of admin names can be configured in the app (see `ADMIN_NAMES` in `src/App.jsx`). Admins are allowed to clear all groups and can edit groups when the week is locked.
  - Admin sign-in is simply entering your full name in the top field — this is a lightweight client-side control intended for small leagues. Do not rely on it for strong security.
- Weekly lock:
  - Groups are locked starting Sunday 3:00 PM Eastern Time (America/New_York) for that week. While locked only admins may add/remove/clear groups.
- Hole assignment:
  - Groups are assigned to holes 1–9 in round-robin order. When the number of groups exceeds 9, groups begin to double up on holes (Group 10 -> Hole 1, Group 11 -> Hole 2, etc.).

How to use

1. Install dependencies

   npm install

2. Run locally

   npm run dev

3. Build for production

   npm run build

After build, upload the contents of `dist/` to an S3 bucket or use Amplify for CI/CD.

Configuration notes

- To change the admin users, edit `ADMIN_NAMES` near the top of `src/App.jsx`.
- The week-lock uses the America/New_York timezone to determine Sunday 3:00 PM; the client checks this every minute while the app is open.

Security note

This app uses a simple client-side "admin name" check for convenience in small private leagues. If you need secure admin authentication, integrate a proper auth provider (Cognito, Auth0) and verify admin claims on a trusted server before allowing destructive actions like clearing groups.
