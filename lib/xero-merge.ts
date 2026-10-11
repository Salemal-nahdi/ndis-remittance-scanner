import type { UnpaidInvoice } from "./aging";
import type { ContactRecord } from "./duplicates";

/** A sales invoice as fetched from Xero, before deciding what to keep. */
export interface FetchedInvoice {
  invoiceId: string;
  contactId: string;
  /** Xero status: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED or DELETED */
  status: string;
  unpaid: UnpaidInvoice;
}

export interface XeroData {
  contacts: ContactRecord[];
  unpaidInvoices: UnpaidInvoice[];
  invoiceIndex: Record<string, string>;
}

/** Approved and paid invoices are counted; drafts, voided and deleted ones aren't. */
const COUNTED = new Set(["AUTHORISED", "PAID"]);

/**
 * Applies contacts and invoices that changed in Xero to the stored copy. With
 * `prev` empty this builds the copy from a full fetch.
 */
export function mergeXeroChanges(prev: XeroData, contacts: ContactRecord[], invoices: FetchedInvoice[]): XeroData {
  const contactMap = new Map(prev.contacts.map((c) => [c.contactId, c]));
  for (const c of contacts) contactMap.set(c.contactId, c);

  const unpaid = new Map(prev.unpaidInvoices.map((i) => [i.invoiceId, i]));
  const index = { ...prev.invoiceIndex };
  for (const inv of invoices) {
    unpaid.delete(inv.invoiceId);
    delete index[inv.invoiceId];
    if (COUNTED.has(inv.status)) index[inv.invoiceId] = inv.contactId;
    if (inv.status === "AUTHORISED" && inv.unpaid.amountDueCents > 0) unpaid.set(inv.invoiceId, inv.unpaid);
  }

  // A renamed contact doesn't change its invoices in Xero, so take names from the contact.
  const unpaidInvoices = [...unpaid.values()].map((i) => {
    const name = contactMap.get(i.contactId)?.name;
    return name && name !== i.contactName ? { ...i, contactName: name } : i;
  });

  return {
    contacts: [...contactMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unpaidInvoices,
    invoiceIndex: index,
  };
}

export function countInvoices(index: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const contactId of Object.values(index)) counts[contactId] = (counts[contactId] ?? 0) + 1;
  return counts;
}
