import "server-only";
import { fetchContacts, fetchInvoices } from "./xero";
import { readStore, updateStore, type XeroSnapshot } from "./store";

/** How old the copy of Xero data can get before a background refresh starts. */
const STALE_AFTER_MS = 5 * 60_000;

let inFlight: Promise<XeroSnapshot> | null = null;

/** Pulls contacts and invoices from Xero into the local copy. */
export function syncFromXero(): Promise<XeroSnapshot> {
  inFlight ??= (async () => {
    try {
      const [contacts, { unpaid, counts }] = await Promise.all([fetchContacts(), fetchInvoices()]);
      const snapshot: XeroSnapshot = { syncedAt: new Date().toISOString(), contacts, invoices: unpaid, invoiceCounts: counts };
      await updateStore((d) => {
        d.snapshot = snapshot;
      });
      return snapshot;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Pages read the local copy so they render straight away instead of waiting on
 * Xero. If the copy is getting old a refresh runs in the background, and the
 * next page view shows the new data. Only the very first load waits on Xero.
 */
export async function getSnapshot(): Promise<XeroSnapshot | null> {
  const { snapshot, xero } = await readStore();
  if (!xero) return null;
  if (!snapshot) return syncFromXero();
  if (Date.now() - Date.parse(snapshot.syncedAt) > STALE_AFTER_MS) {
    syncFromXero().catch((err) => console.error("Background Xero sync failed", err));
  }
  return snapshot;
}
