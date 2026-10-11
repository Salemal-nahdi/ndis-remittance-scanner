# NDIS Remittance Scanner

Helps NDIS providers using Xero:
- **Overdue payments**: ages unpaid invoices from their due date and emails the
  nominated addresses when a client goes past the threshold (30 days by default,
  adjustable per client). Staff record what they decided: follow up, put services
  on hold, snooze or dismiss.
- **Contact clean-up**: finds Xero contacts that are probably the same client,
  and clients with no NDIS number recorded.
- **Remittance scanning**: in discovery, see `docs/roadmap.md`.

The app only reads from Xero so far.

## Running it
1. `npm install`
2. Create a Xero app at https://developer.xero.com/app/manage (Web app) with the
   redirect URI `<APP_URL>/api/xero/callback`.
3. Copy `.env.example` to `.env.local` and fill it in.
4. `npm run dev`, sign in with `APP_PASSWORD`, and connect Xero.

Production: `npm run build && npm start` on a server with a persistent disk.
App state (encrypted Xero tokens, settings, decisions and a copy of the Xero data)
is kept in `data/store.json`; set `DATA_DIR` to put it elsewhere. Move it to a
database before running on serverless hosting or for several businesses.

## Alerts
While the server runs, it checks once a day after `ALERT_HOUR` (business time
zone). An email goes out only when a client newly passes the threshold, and each
invoice is only emailed about once. Instead of the built-in timer you can set
`DISABLE_ALERT_SCHEDULER=1` and call `POST /api/alerts/run` with
`Authorization: Bearer $CRON_SECRET` from any scheduler.

## Speed
Pages read a local copy of the Xero data, so switching tabs doesn't wait on Xero.
The copy refreshes in the background when it is over 5 minutes old, when someone
clicks "Refresh now", and before each alert check. Navigation links prefetch each
tab and the browser keeps visited tabs for a minute.

## Checks
`npm test` (logic tests), `npm run typecheck`, `npm run build`.
