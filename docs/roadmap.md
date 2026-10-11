# Feature roadmap

Three features share one Xero connection and the same contact and invoice data.
None of them changes anything in Xero without a person approving it first.

General UI rule: every table can be sorted by clicking its column headings
(click again to reverse), and the sort is kept when the data refreshes.

## 1. Remittance scanning and payment reconciliation
Read remittance advices from the NDIA and plan managers, match each line to an
outstanding Xero invoice, and record the payments in Xero after approval.
Design depends on the email analysis in `docs/remittance-analysis.md`.

## 2. Contact clean-up
Find Xero contacts that are probably the same client and suggest tidying them up.
Duplicates also break remittance matching, so this feeds feature 1.

**Detection**
- Normalise names before comparing: case, punctuation, extra spaces, titles,
  and suffixes such as "(NDIS)", "Plan Managed" or "Self Managed".
- Catch swapped name order ("Smith, Jane" vs "Jane Smith"), nicknames
  and initials, and small typos (fuzzy match with a similarity score).
- Strong signals that override a weak name match: the same NDIS number,
  email address or phone number on two contacts.
- Group the results into clusters of suspected duplicates, each with a
  confidence level and the reasons it was flagged.

**Other checks**
- Contacts with no NDIS number recorded, or one in an invalid format.
- Names that don't follow the business's chosen naming format.
- Contacts with no activity for a long time (archive candidates).

**Review screen**
- For each cluster, show every contact with its invoice count, outstanding
  balance and last activity, so the user can pick which one to keep.
- Actions: open the contacts in Xero to merge them (the Xero API has no merge
  endpoint, so merging happens in Xero's own screen), or mark the cluster
  "not duplicates" so it is not flagged again.

## 3. Aged receivables alerts
Warn the user when a client's invoices stay unpaid past a threshold they set,
so they can decide what to do, including whether to pause services.
The app never pauses services or contacts anyone by itself.

**Settings**
- Default threshold in days, for example 30 days overdue, plus an optional
  override per client or per plan manager.
- Days counted from the invoice due date by default (from invoice date as an option).
- Who receives alerts and how.

**Data**
- Unpaid sales invoices from Xero, refreshed whenever reconciliation records a
  payment, so the list is always current.
- Standard aging buckets: current, 1-30, 31-60, 61-90 and 90+ days.
- Group by client and also by who pays: the NDIA, each plan manager or
  self-managed. An overdue balance often points to a plan manager problem
  rather than the participant.

**Alerts and decisions**
- When a client crosses their threshold, they appear on the alerts list and
  in the notification digest.
- The user chooses an action: follow up with the payer, put services on
  hold, snooze until a date, or dismiss. Each choice records a note, who made
  it and when, so there is a history for each client.
- An alert clears automatically once the overdue balance is paid.
