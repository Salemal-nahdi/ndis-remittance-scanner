/**
 * Database tests. They run when TEST_DATABASE_URL points at a disposable
 * Postgres database (its tables are emptied), and are skipped otherwise.
 */
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.SESSION_SECRET ??= "test-secret";

describe.skipIf(!url)("store (Postgres)", async () => {
  const { sql } = await import("@/lib/db");
  const store = await import("@/lib/store");

  beforeAll(() => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
  });
  beforeEach(async () => {
    await sql`truncate xero_connection, xero_snapshot, threshold_overrides, decisions, alert_state, alert_runs, not_duplicates`;
    await sql`update settings set default_threshold_days = 30, alert_emails = '{}'`;
  });
  afterAll(() => sql.end());

  it("saves settings and per-client thresholds", async () => {
    await store.saveSettings(45, ["accounts@example.com"]);
    await store.setThresholdOverride("c1", 60);
    await store.setThresholdOverride("c2", 10);
    await store.setThresholdOverride("c2", null);
    expect(await store.getSettings()).toEqual({ defaultThresholdDays: 45, alertEmails: ["accounts@example.com"], overrides: { c1: 60 } });
  });

  it("keeps decision history in order with dates as plain strings", async () => {
    await store.addDecision("c1", { action: "follow_up", note: "Called", by: "Sam", invoiceIds: ["i1"] });
    await store.addDecision("c1", { action: "snooze", note: "", by: "Sam", snoozeUntil: "2026-11-01", invoiceIds: ["i1"] });
    const { c1 } = await store.getDecisions();
    expect(c1.map((d) => d.action)).toEqual(["follow_up", "snooze"]);
    expect(c1[1].snoozeUntil).toBe("2026-11-01");
    expect(c1[0].snoozeUntil).toBeUndefined();
    expect(typeof c1[0].at).toBe("string");
  });

  it("replaces alert state and records runs", async () => {
    await store.replaceAlertState({ c1: { notifiedInvoiceIds: ["i1"], lastNotifiedAt: "2026-10-01T00:00:00.000Z" } });
    await store.replaceAlertState({ c2: { notifiedInvoiceIds: ["i2", "i3"] } });
    expect(await store.getAlertState()).toEqual({ c2: { notifiedInvoiceIds: ["i2", "i3"], lastNotifiedAt: undefined } });
    await store.recordAlertRun({ at: "2026-10-01T22:00:00.000Z", date: "2026-10-02", sent: 3 });
    expect(await store.getLastAlertRun()).toEqual({ at: "2026-10-01T22:00:00.000Z", date: "2026-10-02", sent: 3, error: undefined });
  });

  it("stores the Xero copy, and a new connection clears it", async () => {
    const snapshot = { syncedAt: "2026-10-01T00:00:00.000Z", contacts: [{ contactId: "c1", name: "Jane Citizen" }], invoices: [], invoiceCounts: { c1: 2 } };
    await store.saveXeroConnection({ tokenSet: store.seal({ access_token: "x" }), tenantId: "t1", tenantName: "Demo" });
    await store.saveSnapshot(snapshot);
    expect(await store.getStoredSnapshot()).toEqual(snapshot);
    await store.saveXeroConnection({ tokenSet: store.seal({}), tenantId: "t2", tenantName: "Other" });
    expect(await store.getStoredSnapshot()).toBeNull();
    const conn = await store.getXeroConnection();
    expect(conn?.tenantName).toBe("Other");
    expect(store.unseal(conn!.tokenSet)).toEqual({});
  });

  it("remembers groups marked as different clients", async () => {
    await store.addNotDuplicate("a|b");
    await store.addNotDuplicate("a|b");
    expect(await store.getNotDuplicates()).toEqual(["a|b"]);
  });
});
