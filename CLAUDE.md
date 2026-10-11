# NDIS Remittance Scanner

Reads remittance advices received by NDIS providers (from the NDIA and from plan
managers), matches each payment line to an outstanding invoice in Xero, and
records the payments in Xero once a person approves them.

## Privacy rules
- Real emails and remittances live in `private-data/`, which is gitignored. Never
  commit, copy or paste their contents into tracked files, commit messages, issues or PRs.
- Test fixtures must use invented participants, NDIS numbers and amounts.
- Findings about the real data (formats, senders, field names, edge cases) go in
  `docs/` written in general terms, never with real personal details.

## Status
- Built: overdue payment alerts and contact clean-up (see `README.md`).
- Discovery: analysing ~400 real remittance emails in `private-data/emails/` to
  design remittance scanning (`docs/roadmap.md`).

## Code layout
- `lib/` holds the logic. `aging.ts`, `alerts.ts` and `duplicates.ts` are pure and tested in `tests/`.
- `lib/sync.ts` keeps a local copy of Xero data; pages read it rather than calling Xero.
- Every table sorts by clicking its headings via `components/useSort.tsx`; use it for new tables.
- Money is handled in integer cents (`lib/money.ts`).
- Run `npm test`, `npm run typecheck` and `npm run build` before pushing.
