# PulseGlass

PulseGlass is a MERN starter for tracking blood pressure, pulse, weight, medication adherence, mood, and notes across multiple authenticated users. The UI takes inspiration from Apple's liquid-glass feel, reinterpreted with your warm palette:

- `#FFCDB2`
- `#FFB4A2`
- `#E5989B`
- `#B5828C`

## What is included

- JWT-based authentication with separate accounts per user
- MongoDB persistence with user-scoped health records
- Modern React dashboard with:
  - quick BP logging
  - trend chart
  - adherence metrics
  - reading history
  - health insight cards
- Responsive glassmorphism styling for login and dashboard screens

## Run locally

1. Install dependencies from the project root:

```bash
npm install
```

2. Copy `server/.env.example` to `server/.env` and set your values.

3. Start both apps:

```bash
npm run dev
```

4. Open the frontend at `http://localhost:5173`.

## Environment variables

See `server/.env.example`.

## Stack

- React + Vite
- Express
- MongoDB + Mongoose
- JWT auth
- Recharts for trend visualization

## Suggested next upgrades

- add edit/update support for readings
- add reminders and notifications
- add clinician sharing or PDF export
- add device sync / wearable integrations

