import { describe, expect, it } from "vitest";
import { ageReceivables, type UnpaidInvoice } from "@/lib/aging";
import { alertStatus, nextAlertState, pendingAlerts, type Decision } from "@/lib/alerts";

const today = "2026-10-01";
const settings = { defaultThresholdDays: 30, overrides: {} };
const inv = (id: string, dueDate: string, contactId = "c1"): UnpaidInvoice => ({
  invoiceId: id, invoiceNumber: id, contactId, contactName: contactId, date: dueDate, dueDate, amountDueCents: 1000,
});
const decision = (p: Partial<Decision>): Decision => ({ action: "follow_up", note: "", by: "Sam", at: "2026-09-30T00:00:00Z", invoiceIds: [], ...p });

describe("alerts", () => {
  const rows = ageReceivables([inv("old", "2026-08-01"), inv("new", "2026-09-25"), inv("x", "2026-09-28", "c2")], today, settings);

  it("only alerts contacts with invoices past the threshold", () => {
    const pending = pendingAlerts(rows, {}, {}, today);
    expect(pending.map((p) => p.row.contactId)).toEqual(["c1"]);
    expect(pending[0].newInvoiceIds).toEqual(["old"]);
  });

  it("doesn't email the same invoice twice", () => {
    const state = nextAlertState(rows, {}, pendingAlerts(rows, {}, {}, today), "now");
    expect(pendingAlerts(rows, {}, state, today)).toEqual([]);
  });

  it("alerts again when another invoice crosses the threshold", () => {
    const state = { c1: { notifiedInvoiceIds: ["old"] } };
    const later = ageReceivables([inv("old", "2026-08-01"), inv("new", "2026-09-25")], "2026-10-26", settings);
    expect(pendingAlerts(later, {}, state, "2026-10-26")[0].newInvoiceIds).toEqual(["new"]);
  });

  it("clears the alert once the overdue invoices are paid", () => {
    const paid = ageReceivables([inv("new", "2026-09-25")], today, settings);
    expect(nextAlertState(paid, { c1: { notifiedInvoiceIds: ["old"] } }, [], "now")).toEqual({});
    expect(alertStatus(paid[0], undefined, today)).toBe("clear");
  });

  it("respects snoozes until their date", () => {
    const snoozed = { c1: [decision({ action: "snooze", snoozeUntil: "2026-10-05" })] };
    expect(pendingAlerts(rows, snoozed, {}, today)).toEqual([]);
    expect(pendingAlerts(rows, snoozed, {}, "2026-10-05")).toHaveLength(1);
  });

  it("keeps a dismissal until a new invoice goes overdue", () => {
    const dismissed = { c1: [decision({ action: "dismiss", invoiceIds: ["old"] })] };
    expect(alertStatus(rows[0], dismissed.c1[0], today)).toBe("dismiss");
    const later = ageReceivables([inv("old", "2026-08-01"), inv("new", "2026-09-25")], "2026-10-26", settings);
    expect(alertStatus(later[0], dismissed.c1[0], "2026-10-26")).toBe("overdue");
  });

  it("keeps clients on hold in the email", () => {
    const hold = { c1: [decision({ action: "hold", invoiceIds: ["old"] })] };
    expect(alertStatus(rows[0], hold.c1[0], today)).toBe("hold");
    expect(pendingAlerts(rows, hold, {}, today)).toHaveLength(1);
  });
});
