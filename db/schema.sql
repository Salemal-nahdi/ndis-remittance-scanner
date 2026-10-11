-- Safe to run repeatedly: `npm run db:migrate`.

-- The connected Xero organisation. Tokens are encrypted by the app (lib/store.ts).
create table if not exists xero_connection (
  id smallint primary key default 1 check (id = 1),
  token_set text not null,
  tenant_id text not null,
  tenant_name text not null,
  updated_at timestamptz not null default now()
);

-- Local copy of Xero data, so pages don't wait on Xero. Columns are separate so
-- each page loads only what it shows. Rebuilt from Xero at any time, so it is
-- safe to drop. (Replaces the earlier single-column xero_snapshot table.)
drop table if exists xero_snapshot;
create table if not exists xero_data (
  id smallint primary key default 1 check (id = 1),
  synced_at timestamptz not null,
  -- Last time everything was re-fetched rather than just changes.
  full_synced_at timestamptz not null,
  contacts jsonb not null,
  unpaid_invoices jsonb not null,
  -- invoiceId -> contactId for approved and paid sales invoices, to keep counts right on partial syncs.
  invoice_index jsonb not null,
  invoice_counts jsonb not null,
  -- Worked out once per sync rather than on every page view.
  duplicate_clusters jsonb not null
);

create table if not exists settings (
  id smallint primary key default 1 check (id = 1),
  default_threshold_days int not null default 30 check (default_threshold_days between 1 and 365),
  alert_emails text[] not null default '{}'
);
insert into settings (id) values (1) on conflict do nothing;

-- Per-client overdue thresholds.
create table if not exists threshold_overrides (
  contact_id text primary key,
  days int not null check (days between 1 and 365)
);

-- What staff decided for each overdue client, kept as a history.
create table if not exists decisions (
  id bigint generated always as identity primary key,
  contact_id text not null,
  action text not null check (action in ('follow_up', 'hold', 'snooze', 'dismiss')),
  note text not null default '',
  decided_by text not null,
  decided_at timestamptz not null default now(),
  snooze_until date,
  invoice_ids text[] not null default '{}'
);
create index if not exists decisions_contact_idx on decisions (contact_id, decided_at);

-- Invoices already emailed about, so each is only emailed once.
create table if not exists alert_state (
  contact_id text primary key,
  notified_invoice_ids text[] not null,
  last_notified_at timestamptz
);

create table if not exists alert_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  run_date date not null,
  sent int not null,
  error text
);

-- Duplicate-contact groups that staff confirmed are different clients.
create table if not exists not_duplicates (
  cluster_key text primary key,
  marked_at timestamptz not null default now()
);

-- Who pays each participant's invoices. Set by staff for now; remittance
-- scanning will fill it in from who actually pays.
create table if not exists participant_payers (
  contact_id text primary key,
  payer_type text not null check (payer_type in ('ndia', 'plan_managed', 'self_managed')),
  plan_manager text,
  updated_at timestamptz not null default now()
);
