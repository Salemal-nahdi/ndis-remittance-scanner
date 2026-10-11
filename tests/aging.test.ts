import { describe, expect, it } from "vitest";
import { ageReceivables, bucketFor, type UnpaidInvoice } from "@/lib/aging";
import { daysBetween, parseXeroDate } from "@/lib/dates";

const inv = (p: Partial<UnpaidInvoice>): UnpaidInvoice => ({
  invoiceId: "i1", invoiceNumber: "INV-1", contactId: "c1", contactName: "Test Client",
  date: "2026-08-01", dueDate: "2026-08-15", amountDueCents: 10_000, ...p,
});

describe("dates", () => {
  it("parses both Xero date formats", () => {
    expect(parseXeroDate("/Date(1756684800000+0000)/")).toBe("2025-09-01");
    expect(parseXeroDate("2026-09-01T00:00:00")).toBe("2026-09-01");
    expect(parseXeroDate(undefined)).toBeNull();
  });
  it("counts days across month ends", () => {
    expect(daysBetween("2026-08-15", "2026-09-14")).toBe(30);
  });
});

describe("ageReceivables", () => {
  const settings = { defaultThresholdDays: 30, overrides: {} };

  it("ages from the due date and flags invoices at or past the threshold", () => {
    const [row] = ageReceivables(
      [inv({ invoiceId: "a", dueDate: "2026-08-15" }), inv({ invoiceId: "b", dueDate: "2026-09-20", amountDueCents: 5_000 })],
      "2026-09-14",
      settings,
    );
    expect(row.oldestDaysOverdue).toBe(30);
    expect(row.overThresholdCents).toBe(10_000);
    expect(row.totalDueCents).toBe(15_000);
    expect(row.buckets["1-30"]).toBe(10_000);
    expect(row.buckets.current).toBe(5_000);
  });

  it("uses a contact's own threshold", () => {
    const [row] = ageReceivables([inv({})], "2026-09-14", { defaultThresholdDays: 30, overrides: { c1: 60 } });
    expect(row.thresholdDays).toBe(60);
    expect(row.overThresholdCents).toBe(0);
  });

  it("falls back to the invoice date when there is no due date", () => {
    const [row] = ageReceivables([inv({ dueDate: null, date: "2026-08-01" })], "2026-09-14", settings);
    expect(row.oldestDaysOverdue).toBe(44);
  });

  it("ignores fully paid invoices", () => {
    expect(ageReceivables([inv({ amountDueCents: 0 })], "2026-09-14", settings)).toEqual([]);
  });

  it("buckets by days overdue", () => {
    expect([0, 1, 30, 31, 61, 91].map(bucketFor)).toEqual(["current", "1-30", "1-30", "31-60", "61-90", "90+"]);
  });
});
