import "server-only";
import { XeroClient } from "xero-node";
import type { TokenSet } from "xero-node";
import { toCents } from "./money";
import { parseXeroDate } from "./dates";
import { readStore, seal, unseal, updateStore } from "./store";
import type { UnpaidInvoice } from "./aging";
import type { ContactRecord } from "./duplicates";

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
  const { xero: saved } = await readStore();
  if (!saved) throw new Error("Xero is not connected");
  const xero = xeroClient();
  await xero.initialize();
  xero.setTokenSet(unseal<TokenSet>(saved.tokenSet));
  if (xero.readTokenSet().expired()) {
    const refreshed = await xero.refreshToken();
    await updateStore((d) => {
      if (d.xero) d.xero.tokenSet = seal(refreshed);
    });
  }
  return { xero, tenantId: saved.tenantId };
}

const PAGE_SIZE = 1000;

export async function fetchContacts(): Promise<ContactRecord[]> {
  const { xero, tenantId } = await connectedClient();
  const out: ContactRecord[] = [];
  for (let page = 1; ; page++) {
    const res = await xero.accountingApi.getContacts(
      tenantId, undefined, undefined, "Name ASC", undefined, page, true, undefined, undefined, PAGE_SIZE,
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

/** Sales invoices, with the unpaid ones returned in full and all of them counted per contact. */
export async function fetchInvoices(): Promise<{ unpaid: UnpaidInvoice[]; counts: Record<string, number> }> {
  const { xero, tenantId } = await connectedClient();
  const unpaid: UnpaidInvoice[] = [];
  const counts: Record<string, number> = {};
  for (let page = 1; ; page++) {
    const res = await xero.accountingApi.getInvoices(
      tenantId, undefined, 'Type=="ACCREC"', "DueDate ASC", undefined, undefined, undefined,
      ["AUTHORISED", "PAID"], page, false, undefined, undefined, true, PAGE_SIZE,
    );
    const invoices = res.body.invoices ?? [];
    for (const inv of invoices) {
      const contactId = inv.contact?.contactID ?? "";
      counts[contactId] = (counts[contactId] ?? 0) + 1;
      if (String(inv.status) !== "AUTHORISED") continue;
      unpaid.push({
        invoiceId: inv.invoiceID!,
        invoiceNumber: inv.invoiceNumber ?? "",
        contactId,
        contactName: inv.contact?.name ?? "",
        date: parseXeroDate(inv.date),
        dueDate: parseXeroDate(inv.dueDate),
        amountDueCents: toCents(inv.amountDue),
      });
    }
    if (invoices.length < PAGE_SIZE) return { unpaid, counts };
  }
}
