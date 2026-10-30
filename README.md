# The Torch of Deborah

Women register, get placed in a prayer hub in their state, and join its WhatsApp group. Leaders manage hubs and people.

**Stack:** React (Vite) · Firebase Auth (Google sign-in) + Firestore · Netlify Functions · GitHub → Netlify.

## Journeys

- **A woman registers** at `/join` (name, WhatsApp number, state, LGA, how she'll take part, consent). She immediately sees her hub, her leader and a "Join the WhatsApp group" button. If every hub in her state is full or has no leader, she's on the waiting list.
- **She comes back** at `/find` by entering her WhatsApp number.
- **Leaders sign in with Google** at `/login`. An admin (or a state coordinator, for hub leaders) adds them on the Team page by their Google email. No passwords or invitations.

## Dashboard

| Role | Sees |
|---|---|
| Admin | Overview, People, Hubs, Team, Settings — all states |
| State coordinator | Overview, People, Hubs, Team — their state |
| Hub leader | Their hub: members, WhatsApp chat buttons, group link |

## Setup

1. Firebase → Authentication → Sign-in method → enable **Google**. Add your Netlify domain under Authorised domains.
2. Netlify environment variables:
   - `FIREBASE_SERVICE_ACCOUNT` — the service account JSON (or base64 of it)
   - `ADMIN_EMAILS` — comma-separated Google emails that are always admins
3. Deploy, then sign in at `/login`. The first admin sign-in seeds the states and applies the database rules and indexes automatically.

## Development

```bash
npm install
npm test        # allocation and end-to-end flow tests against an in-memory Firestore
npx netlify dev
```
