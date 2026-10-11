import { describe, expect, it } from "vitest";
import { ageReceivables } from "@/lib/aging";
import { pendingAlerts } from "@/lib/alerts";
import { alertEmail } from "@/lib/email";
import { payerLabel } from "@/lib/payers";

describe("payerLabel", () => {
  it("names the plan manager for plan-managed participants", () => {
    expect(payerLabel({ type: "plan_managed", planManager: "Example Plan Partners" })).toBe("Example Plan Partners");
    expect(payerLabel({ type: "plan_managed" })).toBe("Plan managed (manager not set)");
    expect(payerLabel({ type: "ndia" })).toBe("NDIA");
    expect(payerLabel(undefined)).toBe("Not set");
  });
});

describe("alertEmail", () => {
  it("lists each participant with who pays and escapes names", () => {
    const rows = ageReceivables(
      [{ invoiceId: "i1", invoiceNumber: "INV-1", contactId: "c1", contactName: "Jane <Citizen>", date: "2026-08-01", dueDate: "2026-08-01", amountDueCents: 12345 }],
      "2026-10-01",
      { defaultThresholdDays: 30, overrides: {} },
    );
    const { subject, html } = alertEmail(pendingAlerts(rows, {}, {}, "2026-10-01"), 1, { c1: { type: "plan_managed", planManager: "Example Plan Partners" } });
    expect(subject).toBe("1 participant newly overdue past the payment threshold");
    expect(html).toContain("Jane &lt;Citizen&gt;");
    expect(html).toContain("Example Plan Partners");
    expect(html).toContain("$123.45");
  });
});
