import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AlertState, Decision, DecisionAction } from "./alerts";
import type { UnpaidInvoice } from "./aging";
import type { ContactRecord } from "./duplicates";
import type { Payer, PayerType } from "./payers";
import postgres from "postgres";
import { sql } from "./db";

/** App state in Postgres. Tables are defined in db/schema.sql. */

export interface Settings {
  defaultThresholdDays: number;
  overrides: Record<string, number>;
  alertEmails: string[];
}

export interface XeroSnapshot {
  syncedAt: string;
  contacts: ContactRecord[];
  invoices: UnpaidInvoice[];
  /** contactId -> number of invoices of any status, for the clean-up screen */
  invoiceCounts: Record<string, number>;
}

export interface XeroConnection {
  /** Encrypted with seal() */
  tokenSet: string;
  tenantId: string;
  tenantName: string;
}

export interface AlertRun {
  at: string;
  date: string;
  sent: number;
  error?: string;
}

/** The pool, or a transaction from sql.begin(). */
type Tx = postgres.Sql | postgres.TransactionSql;

// Xero connection

export async function getXeroConnection(db: Tx = sql): Promise<XeroConnection | null> {
  const [row] = await db<XeroConnection[]>`
    select token_set as "tokenSet", tenant_id as "tenantId", tenant_name as "tenantName"
    from xero_connection where id = 1`;
  return row ?? null;
}

/** Saves a new connection and drops the copy of the previous organisation's data. */
export async function saveXeroConnection(c: XeroConnection): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      insert into xero_connection (id, token_set, tenant_id, tenant_name)
      values (1, ${c.tokenSet}, ${c.tenantId}, ${c.tenantName})
      on conflict (id) do update set token_set = excluded.token_set, tenant_id = excluded.tenant_id,
        tenant_name = excluded.tenant_name, updated_at = now()`;
    await tx`delete from xero_snapshot`;
  });
}

export async function saveXeroTokens(tokenSet: string, db: Tx = sql): Promise<void> {
  await db`update xero_connection set token_set = ${tokenSet}, updated_at = now() where id = 1`;
}

// Copy of Xero data

export async function getStoredSnapshot(): Promise<XeroSnapshot | null> {
  const [row] = await sql<{ syncedAt: Date; data: Omit<XeroSnapshot, "syncedAt"> }[]>`
    select synced_at as "syncedAt", data from xero_snapshot where id = 1`;
  return row ? { ...row.data, syncedAt: row.syncedAt.toISOString() } : null;
}

export async function saveSnapshot(s: XeroSnapshot): Promise<void> {
  const { syncedAt, ...data } = s;
  await sql`
    insert into xero_snapshot (id, synced_at, data) values (1, ${syncedAt}, ${sql.json(data as never)})
    on conflict (id) do update set synced_at = excluded.synced_at, data = excluded.data`;
}

// Settings

export async function getSettings(): Promise<Settings> {
  const [[row], overrides] = await Promise.all([
    sql<{ defaultThresholdDays: number; alertEmails: string[] }[]>`
      select default_threshold_days as "defaultThresholdDays", alert_emails as "alertEmails" from settings where id = 1`,
    sql<{ contactId: string; days: number }[]>`select contact_id as "contactId", days from threshold_overrides`,
  ]);
  return {
    defaultThresholdDays: row?.defaultThresholdDays ?? 30,
    alertEmails: row?.alertEmails ?? [],
    overrides: Object.fromEntries(overrides.map((o) => [o.contactId, o.days])),
  };
}

export async function saveSettings(defaultThresholdDays: number, alertEmails: string[]): Promise<void> {
  await sql`
    insert into settings (id, default_threshold_days, alert_emails) values (1, ${defaultThresholdDays}, ${alertEmails})
    on conflict (id) do update set default_threshold_days = excluded.default_threshold_days, alert_emails = excluded.alert_emails`;
}

export async function setThresholdOverride(contactId: string, days: number | null): Promise<void> {
  if (days === null) {
    await sql`delete from threshold_overrides where contact_id = ${contactId}`;
  } else {
    await sql`
      insert into threshold_overrides (contact_id, days) values (${contactId}, ${days})
      on conflict (contact_id) do update set days = excluded.days`;
  }
}

// Decisions

/** Every contact's decisions, oldest first. */
export async function getDecisions(): Promise<Record<string, Decision[]>> {
  const rows = await sql<(Decision & { contactId: string; at: Date; snoozeUntil: string | null })[]>`
    select contact_id as "contactId", action, note, decided_by as "by", decided_at as "at",
      snooze_until::text as "snoozeUntil", invoice_ids as "invoiceIds"
    from decisions order by decided_at, id`;
  const out: Record<string, Decision[]> = {};
  for (const { contactId, at, snoozeUntil, ...d } of rows) {
    (out[contactId] ??= []).push({ ...d, at: at.toISOString(), snoozeUntil: snoozeUntil ?? undefined });
  }
  return out;
}

export async function addDecision(
  contactId: string,
  d: { action: DecisionAction; note: string; by: string; snoozeUntil?: string; invoiceIds: string[] },
): Promise<void> {
  await sql`
    insert into decisions (contact_id, action, note, decided_by, snooze_until, invoice_ids)
    values (${contactId}, ${d.action}, ${d.note}, ${d.by}, ${d.snoozeUntil ?? null}, ${d.invoiceIds})`;
}

// Alerts

export async function getAlertState(db: Tx = sql): Promise<Record<string, AlertState>> {
  const rows = await db<{ contactId: string; notifiedInvoiceIds: string[]; lastNotifiedAt: Date | null }[]>`
    select contact_id as "contactId", notified_invoice_ids as "notifiedInvoiceIds", last_notified_at as "lastNotifiedAt"
    from alert_state`;
  return Object.fromEntries(
    rows.map((r) => [r.contactId, { notifiedInvoiceIds: r.notifiedInvoiceIds, lastNotifiedAt: r.lastNotifiedAt?.toISOString() }]),
  );
}

export async function replaceAlertState(state: Record<string, AlertState>, db: Tx = sql): Promise<void> {
  await db`delete from alert_state`;
  const rows = Object.entries(state).map(([contactId, s]) => ({
    contact_id: contactId,
    notified_invoice_ids: s.notifiedInvoiceIds,
    last_notified_at: s.lastNotifiedAt ?? null,
  }));
  if (rows.length) await db`insert into alert_state ${db(rows)}`;
}

export async function recordAlertRun(run: AlertRun, db: Tx = sql): Promise<void> {
  await db`insert into alert_runs (ran_at, run_date, sent, error) values (${run.at}, ${run.date}, ${run.sent}, ${run.error ?? null})`;
}

export async function getLastAlertRun(): Promise<AlertRun | null> {
  const [row] = await sql<{ at: Date; date: string; sent: number; error: string | null }[]>`
    select ran_at as "at", run_date::text as "date", sent, error from alert_runs order by ran_at desc limit 1`;
  return row ? { at: row.at.toISOString(), date: row.date, sent: row.sent, error: row.error ?? undefined } : null;
}

// Who pays each participant

export async function getPayers(): Promise<Record<string, Payer>> {
  const rows = await sql<{ contactId: string; type: PayerType; planManager: string | null }[]>`
    select contact_id as "contactId", payer_type as "type", plan_manager as "planManager" from participant_payers`;
  return Object.fromEntries(rows.map((r) => [r.contactId, { type: r.type, planManager: r.planManager ?? undefined }]));
}

export async function setPayer(contactId: string, payer: Payer | null): Promise<void> {
  if (!payer) {
    await sql`delete from participant_payers where contact_id = ${contactId}`;
    return;
  }
  const planManager = payer.type === "plan_managed" ? payer.planManager?.trim() || null : null;
  await sql`
    insert into participant_payers (contact_id, payer_type, plan_manager) values (${contactId}, ${payer.type}, ${planManager})
    on conflict (contact_id) do update set payer_type = excluded.payer_type, plan_manager = excluded.plan_manager, updated_at = now()`;
}

// Contact clean-up

export async function getNotDuplicates(): Promise<string[]> {
  const rows = await sql<{ clusterKey: string }[]>`select cluster_key as "clusterKey" from not_duplicates`;
  return rows.map((r) => r.clusterKey);
}

export async function addNotDuplicate(clusterKey: string): Promise<void> {
  await sql`insert into not_duplicates (cluster_key) values (${clusterKey}) on conflict do nothing`;
}

// Encryption for Xero tokens at rest

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function unseal<T>(sealed: string): T {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
}
