# The Torch of Deborah

Movement management platform for mobilising 10,000 women into 500 prayer hubs for six months of daily prayer for Nigeria.

**Stack:** React (Vite) · Firebase Auth + Cloud Firestore · Netlify (hosting + serverless functions) · GitHub.

No Firebase Cloud Functions are used, so the Firebase project can stay on the free Spark plan. All server logic runs as Netlify Functions using the Firebase Admin SDK.

## What is in Phase 1

| Area | Where |
|---|---|
| Public website (home, about/mission, volunteer, contact, privacy) | `src/pages/public` |
| Registration with validation, consent and duplicate protection (normalised phone + email) | `src/pages/public/Join.jsx`, `netlify/functions/register.mjs` |
| Automatic allocation: active hub in the state, has a leader, has space, lowest occupancy (LGA tie-break); otherwise the waiting queue and the state coordinator is emailed | `src/lib/shared.js#pickHub`, `netlify/functions/_lib/allocate.js` |
| Personal welcome page (secret link, not guessable): hub, leader, WhatsApp + Telegram links, schedule, Zoom, announcements, “I've joined”, “I prayed today”, reassignment request | `src/pages/public/Welcome.jsx`, `netlify/functions/participant.mjs` |
| Role-based dashboards: national admin, state coordinator, hub leader, volunteer | `src/pages/app` |
| Participants directory: search, filters, edit, move between hubs/states, join status, follow-up, deactivate, mark duplicate, full hub history | `Participants.jsx`, `ParticipantDrawer.jsx` |
| Hubs, states (incl. extra LGAs, state Zoom), leadership invitations, volunteers | `Hubs.jsx`, `States.jsx`, `Leadership.jsx`, `Volunteers.jsx` |
| Prayer schedule: programme dates, daily time, time zone, central/state/hub Zoom links, daily themes, special meetings | `Schedule.jsx` |
| Announcements by state / hub / role, to welcome pages and email, now or scheduled | `Notifications.jsx`, `dispatch-announcements.mjs` |
| Attendance (bulk marking), follow-ups, 14-day participation trend | `Attendance.jsx`, `FollowUps.jsx`, `Overview.jsx` |
| CSV exports (open in Excel): participants, onboarding, hub occupancy, states, leadership, volunteers, attendance | `Reports.jsx` |
| Activity log of every administrative action | `Activity.jsx` |
| Configurable settings for every open organisational decision (capacity, leader counted or not, leaderless hubs, coordinator permissions, links, dates) | `Settings.jsx` |

## Security model

- Browsers can only **read**, and Firestore rules limit reads by role: coordinators see only their state, hub leaders only their hubs. Every write goes through a Netlify Function that verifies the Firebase ID token, checks the role server-side and writes an activity log entry.
- Roles live in Firebase custom claims plus a `users` profile document.
- Participants never sign in. Their welcome page uses a random 192-bit token; only its SHA-256 hash is stored.
- Exports are logged. CSV cells are protected against spreadsheet formula injection.

## Setup

1. **Firebase**: create a project, enable **Authentication → Email/Password** and **Firestore** (production mode). Add a Web app and note its config.
2. **Service account**: Project settings → Service accounts → Generate new private key. Base64-encode the JSON (`base64 -w0 key.json`).
3. **Netlify environment variables** (Site settings → Environment variables):

   | Variable | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | from the web app config |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | project id |
   | `VITE_FIREBASE_APP_ID` | from the web app config |
   | `FIREBASE_SERVICE_ACCOUNT` | the base64 service account JSON |
   | `BOOTSTRAP_SECRET` | any long random string (16+ chars) |
   | `SITE_URL` | optional, e.g. `https://torchofdeborah.org` |
   | `MAIL_BULK_TO` | optional; address placed in "To" for bulk announcement emails (recipients go in BCC) |

4. Deploy, then open **`/setup`**, enter the `BOOTSTRAP_SECRET`, your name and email. This creates the first super administrator, seeds the 37 states and settings, and deploys Firestore rules and indexes. Indexes take a few minutes to build.
5. In Firebase Authentication → Settings → Authorised domains, add your Netlify domain.

### Email

Emails are queued in the Firestore `mail` collection in the format of the official **Trigger Email from Firestore** extension. Install that extension with any SMTP provider to send them (the extension requires the Blaze plan). Until it is installed, nothing is lost: invitations and password resets also return a link that admins can share on WhatsApp, and every participant sees her details on her welcome page.

For thousands of recipients use a bulk-capable SMTP service rather than a personal Gmail account.

## Development

```bash
npm install
npm test          # allocation, scheduling and end-to-end flow tests (in-memory Firestore)
npx netlify dev   # runs the site and functions locally with your env vars
```

`firestore.rules` and `firestore.indexes.json` are generated from `netlify/functions/_lib/firebase-config.js` with `node scripts/export-firebase-config.mjs`.

## Phase 2 ideas already supported by the data model

Recurring reminder emails (scheduled function + `mail`), WhatsApp Business API delivery (swap `queueMail` for a provider), Zoom attendance import (`attendance.source = "zoom"`), participant self-service profile edits.
