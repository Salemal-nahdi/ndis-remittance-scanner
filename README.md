# NDIS Remittance Scanner

Helps NDIS providers using Xero:
- **Overdue payments**: ages unpaid invoices from their due date and emails the
  nominated addresses when a client goes past the threshold (30 days by default,
  adjustable per client). Staff record what they decided: follow up, put services
  on hold, snooze or dismiss. Each participant can be marked as paid by the
  NDIA, a named plan manager or self-managed, and the "Who pays" view totals
  overdue amounts per payer.
- **Contact clean-up**: finds Xero contacts that are probably the same client,
  and clients with no NDIS number recorded.
- **Remittance scanning**: in discovery, see `docs/roadmap.md`.

The app only reads from Xero so far.

## Running it
1. `npm install`
2. Create a Postgres database (or use a local one) and run `npm run db:migrate`.
3. Create a Xero app at https://developer.xero.com/app/manage (Web app) with the
   redirect URI `<APP_URL>/api/xero/callback`.
4. Copy `.env.example` to `.env.local` and fill it in.
5. `npm run dev`, sign in with `APP_PASSWORD`, and connect Xero.

App state (encrypted Xero tokens, settings, decisions, alert history and a copy
of the Xero data) lives in Postgres. Any provider works: Neon, Supabase, Railway,
Vercel Postgres or your own server.

## Deploying
1. Create a Postgres database and put its connection string in `DATABASE_URL`
   (use the pooled one if offered).
2. Run `npm run db:migrate` once, and again after updates that change `db/schema.sql`.
   It is safe to run repeatedly.
3. Deploy. On Vercel, import the repo, add the environment variables from
   `.env.example`, and set `CRON_SECRET` so the daily alert check in `vercel.json`
   can run. On an always-on server, `npm run build && npm start` is enough.

## Alerts
The check runs once a day. An email goes out only when a client newly passes the
threshold, and each invoice is only emailed about once.
- On Vercel, `vercel.json` calls `/api/alerts/run` at 21:50 UTC (about 8am in
  Sydney in summer, 7am in winter). Change the schedule there.
- On an always-on server, a built-in timer runs it after `ALERT_HOUR` in the
  business time zone. To use your own scheduler instead, set
  `DISABLE_ALERT_SCHEDULER=1` and call `/api/alerts/run` with
  `Authorization: Bearer $CRON_SECRET`.

A database lock stops the scheduled check and the "send now" button from emailing
the same clients twice.

## Speed
Pages read a local copy of the Xero data, so switching tabs doesn't wait on Xero.
The copy refreshes in the background when it is over 5 minutes old, when someone
clicks "Refresh now", and before each alert check. Navigation links prefetch each
tab and the browser keeps visited tabs for a minute.

## Checks
`npm test`, `npm run typecheck`, `npm run build`. The database tests run when
`TEST_DATABASE_URL` points at a throwaway Postgres database (its tables are emptied);
otherwise they are skipped.
