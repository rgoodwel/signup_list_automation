# Signup List Automation

This repository contains a minimal React application (Vite) for a golf league weekly signup. It stores groups of players (names only) in the browser localStorage and includes logic to automatically form groups up to 4 players.

Behavior summary

- Each signup is a player's name only (no email).
- A user can sign up as an individual or include 1-3 partner names (comma-separated).
- If you sign up as an individual, the app places you in the first existing group with available space (<4). If none, a new group is created.
- If you sign up with other players and some of those players are already signed up in groups, the app will merge those groups together automatically as long as the resulting group does not exceed 4 players. If merging would exceed 4 players, the signup is rejected with a warning.
- Groups are persisted in localStorage under the key `signup_list_automation.groups_v1`.

Quick start

1. Install dependencies

   npm install

2. Run locally

   npm run dev

3. Build for production

   npm run build

After build, upload the contents of `dist/` to an S3 bucket or use Amplify for CI/CD.
