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
Discovery phase: analysing a sample of ~400 real remittance emails in
`private-data/emails/` to decide what to extract, how to match it, and what to automate.
