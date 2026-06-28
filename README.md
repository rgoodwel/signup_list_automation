# Signup List Automation (Golf League)

This React + Vite app implements a weekly golf-league signup system. It stores groups of players (names + emails) in browser localStorage and includes rules to form and manage groups for play across 9 holes.

New/updated features

- No longer requires users to "set name" before signing up; general users can sign up directly in the main form with name + email.
- Admin login moved to the bottom of the page — admins enter their full name (client-side) to get admin privileges (clear groups, edit during locked weeks).
- Each player now provides an email (validated with a simple regex). The form enforces first + last name and a valid email for every player.
- Profiles: saved name+email mapping stored in localStorage so future signups can use the browser datalist to quickly select existing names and autofill email.
- Holes display: UI initially shows all 9 holes (1..9). Groups are assigned in round-robin order across holes. When more than 9 groups exist, holes receive multiple groups (A/B labels)
- Signup locking is now fully admin-controlled from the admin page. Admins manually unlock/lock signups for the current week.

Storage keys

- Groups: `signup_list_automation.groups_v3`
- Profiles: `signup_list_automation.profiles_v1`

Security note

- The admin login is a light client-side convenience for small private leagues. For stronger security, integrate a proper authentication provider (Cognito, Auth0) and verify admin claims server-side.

To run

1. npm install
2. npm run dev
3. npm run build

## Deployment

- Build artifacts appear in `dist/`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full AWS deployment guide (S3 + CloudFront + GitHub Actions CI/CD with Terraform).
