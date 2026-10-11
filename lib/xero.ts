import "server-only";
import { XeroClient } from "xero-node";
import type { TokenSet } from "xero-node";
import { toCents } from "./money";
import { parseXeroDate } from "./dates";
import { LOCKS, sql } from "./db";
import { getXeroConnection, saveXeroTokens, seal, unseal } from "./store";
import type { ContactRecord } from "./duplicates";
import type { FetchedInvoice } from "./xero-merge";

/**
 * Xero apps created from March 2026 use granular scopes. Older apps can set
 * XERO_SCOPES to the broad ones, e.g. "... accounting.transactions.read accounting.contacts.read".
 */
const SCOPES =
  process.env.XERO_SCOPES ??
  "openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read";

export function xeroClient(): XeroClient {
  return new XeroClient({
    clientId: process.env.XERO_CLIENT_ID!,
    clientSecret: process.env.XERO_CLIENT_SECRET!,
    redirectUris: [`${process.env.APP_URL}/api/xero/callback`],
    scopes: SCOPES.split(" "),
  });
}

/** A client with a valid access token for the connected organisation. */
async function connectedClient(): Promise<{ xero: XeroClient; tenantId: string }> {
  const saved = await getXeroConnection();
  if (!saved) throw new Error("Xero is not connected");
  const xero = xeroClient();
  await xero.initialize();
  xero.setTokenSet(unseal<TokenSet>(saved.tokenSet));
  if (!xero.readTokenSet().expired()) return { xero, tenantId: saved.tenantId };

  // Xero refresh tokens work once, so only one request may refresh at a time.
  // Others wait for the lock, then use the token it saved.
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCKS.xeroTokens})`;
    const latest = await getXeroConnection(tx);
    if (!latest) throw new Error("Xero is not connected");
    xero.setTokenSet(unseal<TokenSet>(latest.tokenSet));
    if (xero.readTokenSet().expired()) {
      await saveXeroTokens(seal(await xero.refreshToken()), tx);
    }
  });
  return { xero, tenantId: saved.tenantId };
}

const PAGE_SIZE = 1000;

/** Contacts, or only those changed since `since`. Archived ones are included. */
export async function fetchContacts(since?: Date): Promise<ContactRecord[]> {
  const { xero, tenantId } = await connectedClient();
  const out: ContactRecord[] = [];
  for (let page = 1; ; page++) {
    const res = await xero.accountingApi.getContacts(
      tenantId, since, undefined, "Name ASC", undefined, page, true, undefined, undefined, PAGE_SIZE,
    );
    const contacts = res.body.contacts ?? [];
    for (const c of contacts) {
      const phone = c.phones?.find((p) => p.phoneNumber);
      out.push({
        contactId: c.contactID!,
        name: c.name ?? "",
        email: c.emailAddress || undefined,
        phone: phone ? `${phone.phoneAreaCode ?? ""}${phone.phoneNumber}` : undefined,
        accountNumber: c.accountNumber || undefined,
        archived: String(c.contactStatus) === "ARCHIVED",
      });
    }
    if (contacts.length < PAGE_SIZE) return out;
  }
}

/**
 * Sales invoices. A full fetch gets approved and paid ones; a fetch of changes
 * since `since` gets every status, so voided and deleted invoices are removed.
 */
export async function fetchInvoices(since?: Date): Promise<FetchedInvoice[]> {
  const { xero, tenantId } = await connectedClient();
  const statuses = since ? undefined : ["AUTHORISED", "PAID"];
  const out: FetchedInvoice[] = [];
  for (let page = 1; ; page++) {
    const res = await xero.accountingApi.getInvoices(
      tenantId, since, 'Type=="ACCREC"', "UpdatedDateUTC ASC", undefined, undefined, undefined,
      statuses, page, false, undefined, undefined, true, PAGE_SIZE,
    );
    const invoices = res.body.invoices ?? [];
    for (const inv of invoices) {
      const contactId = inv.contact?.contactID ?? "";
      out.push({
        invoiceId: inv.invoiceID!,
        contactId,
        status: String(inv.status),
        unpaid: {
          invoiceId: inv.invoiceID!,
          invoiceNumber: inv.invoiceNumber ?? "",
          contactId,
          contactName: inv.contact?.name ?? "",
          date: parseXeroDate(inv.date),
          dueDate: parseXeroDate(inv.dueDate),
          amountDueCents: toCents(inv.amountDue),
        },
      });
    }
    if (invoices.length < PAGE_SIZE) return out;
  }
}
