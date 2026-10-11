import { describe, expect, it } from "vitest";
import { countInvoices, mergeXeroChanges, type FetchedInvoice, type XeroData } from "@/lib/xero-merge";

const fetched = (invoiceId: string, status: string, amountDueCents = 1000, contactId = "c1"): FetchedInvoice => ({
  invoiceId,
  contactId,
  status,
  unpaid: { invoiceId, invoiceNumber: invoiceId, contactId, contactName: "Jane Citizen", date: "2026-09-01", dueDate: "2026-09-15", amountDueCents },
});
const empty: XeroData = { contacts: [], unpaidInvoices: [], invoiceIndex: {} };

describe("mergeXeroChanges", () => {
  const initial = mergeXeroChanges(
    empty,
    [{ contactId: "c1", name: "Jane Citizen" }, { contactId: "c2", name: "Mark Example" }],
    [fetched("i1", "AUTHORISED"), fetched("i2", "PAID", 0), fetched("i3", "AUTHORISED", 500, "c2")],
  );

  it("builds the copy from a full fetch", () => {
    expect(initial.unpaidInvoices.map((i) => i.invoiceId).sort()).toEqual(["i1", "i3"]);
    expect(countInvoices(initial.invoiceIndex)).toEqual({ c1: 2, c2: 1 });
  });

  it("drops invoices that get paid, voided or deleted, and adds new ones", () => {
    const next = mergeXeroChanges(initial, [], [fetched("i1", "PAID", 0), fetched("i3", "VOIDED", 500, "c2"), fetched("i4", "AUTHORISED", 200)]);
    expect(next.unpaidInvoices.map((i) => i.invoiceId)).toEqual(["i4"]);
    expect(countInvoices(next.invoiceIndex)).toEqual({ c1: 3 });
  });

  it("doesn't count an invoice twice when it changes again", () => {
    const next = mergeXeroChanges(initial, [], [fetched("i1", "AUTHORISED", 400)]);
    expect(countInvoices(next.invoiceIndex)).toEqual({ c1: 2, c2: 1 });
    expect(next.unpaidInvoices.find((i) => i.invoiceId === "i1")?.amountDueCents).toBe(400);
  });

  it("ignores drafts", () => {
    const next = mergeXeroChanges(initial, [], [fetched("i9", "DRAFT")]);
    expect(next.unpaidInvoices).toHaveLength(2);
    expect(next.invoiceIndex.i9).toBeUndefined();
  });

  it("updates changed contacts and carries renames onto unpaid invoices", () => {
    const next = mergeXeroChanges(initial, [{ contactId: "c1", name: "Jane Citizen-Smith" }, { contactId: "c3", name: "Alex Example" }], []);
    expect(next.contacts.map((c) => c.name)).toEqual(["Alex Example", "Jane Citizen-Smith", "Mark Example"]);
    expect(next.unpaidInvoices.find((i) => i.invoiceId === "i1")?.contactName).toBe("Jane Citizen-Smith");
  });
});
