import "server-only";
import { after } from "next/server";
import { LOCKS, sql } from "./db";
import { findDuplicateClusters } from "./duplicates";
import { getSyncedAt, getXeroConnectionForRequest, getXeroData, saveXeroData } from "./store";
import { fetchContacts, fetchInvoices } from "./xero";
import { countInvoices, mergeXeroChanges } from "./xero-merge";

/** How old the copy of Xero data can get before a background refresh starts. */
const STALE_AFTER_MS = 5 * 60_000;
/** Re-fetch everything this often, in case a change was ever missed. */
const FULL_SYNC_AFTER_MS = 24 * 60 * 60_000;
/** Fetch changes from a little before the last sync, so nothing slips between syncs. */
const OVERLAP_MS = 5 * 60_000;

let inFlight: Promise<void> | null = null;

/**
 * Brings the copy of Xero data up to date. Normally only contacts and invoices
 * changed since the last sync are fetched; everything is re-fetched on the first
 * sync, once a day, or when `full` is set.
 */
export function syncFromXero(opts: { full?: boolean } = {}): Promise<void> {
  inFlight ??= runSync(opts.full ?? false).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(forceFull: boolean): Promise<void> {
  const requestedAt = Date.now();
  await sql.begin(async (tx) => {
    // One sync at a time across all servers. Requests that queue behind a sync
    // which started after they asked have nothing left to fetch.
    await tx`select pg_advisory_xact_lock(${LOCKS.xeroSync})`;
    const prev = await getXeroData(tx);
    if (prev && !forceFull && Date.parse(prev.syncedAt) >= requestedAt) return;

    const startedAt = new Date();
    const full = forceFull || !prev || startedAt.getTime() - Date.parse(prev.fullSyncedAt) > FULL_SYNC_AFTER_MS;
    const since = full || !prev ? undefined : new Date(Date.parse(prev.syncedAt) - OVERLAP_MS);
    const [contacts, invoices] = await Promise.all([fetchContacts(since), fetchInvoices(since)]);

    const base = full || !prev ? { contacts: [], unpaidInvoices: [], invoiceIndex: {} } : prev;
    const merged = mergeXeroChanges(base, contacts, invoices);
    await saveXeroData(
      {
        ...merged,
        syncedAt: startedAt.toISOString(),
        fullSyncedAt: full || !prev ? startedAt.toISOString() : prev.fullSyncedAt,
        invoiceCounts: countInvoices(merged.invoiceIndex),
        duplicateClusters: findDuplicateClusters(merged.contacts),
      },
      tx,
    );
  });
}

/**
 * Call before reading Xero data on a page. Returns false if Xero isn't connected.
 * Pages read the stored copy so they render straight away; if it is getting old
 * a refresh runs after the page is sent. Only the very first load waits on Xero.
 */
export async function ensureXeroData(): Promise<boolean> {
  const [xero, syncedAt] = await Promise.all([getXeroConnectionForRequest(), getSyncedAt()]);
  if (!xero) return false;
  if (!syncedAt) {
    await syncFromXero();
  } else if (Date.now() - Date.parse(syncedAt) > STALE_AFTER_MS) {
    // after() runs once the page has been sent, and keeps serverless functions alive until it finishes.
    after(() => syncFromXero().catch((err) => console.error("Background Xero sync failed", err)));
  }
  return true;
}
