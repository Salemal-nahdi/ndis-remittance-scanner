/** Sync tests against a disposable Postgres database (see store.test.ts), with Xero faked. */
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.SESSION_SECRET ??= "test-secret";

const xero = vi.hoisted(() => ({
  fetchContacts: vi.fn(),
  fetchInvoices: vi.fn(),
}));
vi.mock("@/lib/xero", () => xero);
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

const invoice = (invoiceId: string, status: string, amountDueCents = 1000) => ({
  invoiceId,
  contactId: "c1",
  status,
  unpaid: { invoiceId, invoiceNumber: invoiceId, contactId: "c1", contactName: "Jane Citizen", date: "2026-09-01", dueDate: "2026-09-15", amountDueCents },
});

describe.skipIf(!url)("syncFromXero (Postgres)", async () => {
  const { sql } = await import("@/lib/db");
  const store = await import("@/lib/store");
  const { syncFromXero } = await import("@/lib/sync");

  beforeAll(() => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
  });
  beforeEach(async () => {
    await sql`truncate xero_data`;
    xero.fetchContacts.mockReset();
    xero.fetchInvoices.mockReset();
  });
  afterAll(() => sql.end());

  it("fetches everything first, then only changes", async () => {
    xero.fetchContacts.mockResolvedValue([{ contactId: "c1", name: "Jane Citizen" }, { contactId: "c2", name: "Citizen, Jane" }]);
    xero.fetchInvoices.mockResolvedValue([invoice("i1", "AUTHORISED"), invoice("i2", "PAID", 0)]);
    await syncFromXero();
    expect(xero.fetchInvoices).toHaveBeenLastCalledWith(undefined);
    const first = await store.getXeroData();
    expect(first?.unpaidInvoices.map((i) => i.invoiceId)).toEqual(["i1"]);
    expect(first?.invoiceCounts).toEqual({ c1: 2 });
    expect(first?.duplicateClusters).toHaveLength(1);

    xero.fetchContacts.mockResolvedValue([]);
    xero.fetchInvoices.mockResolvedValue([invoice("i1", "PAID", 0)]);
    await syncFromXero();
    const since = xero.fetchInvoices.mock.lastCall?.[0] as Date;
    expect(since).toBeInstanceOf(Date);
    expect(Date.parse(first!.syncedAt) - since.getTime()).toBe(5 * 60_000);
    const second = await store.getXeroData();
    expect(second?.unpaidInvoices).toEqual([]);
    expect(second?.contacts).toHaveLength(2);
    expect(second?.fullSyncedAt).toBe(first?.fullSyncedAt);
  });

  it("re-fetches everything once a day", async () => {
    xero.fetchContacts.mockResolvedValue([]);
    xero.fetchInvoices.mockResolvedValue([invoice("i1", "AUTHORISED")]);
    await syncFromXero();
    await sql`update xero_data set full_synced_at = now() - interval '25 hours', synced_at = now() - interval '1 hour'`;
    xero.fetchInvoices.mockResolvedValue([]);
    await syncFromXero();
    expect(xero.fetchInvoices).toHaveBeenLastCalledWith(undefined);
    expect((await store.getXeroData())?.unpaidInvoices).toEqual([]);
  });

  it("shares one sync between overlapping requests", async () => {
    xero.fetchContacts.mockResolvedValue([]);
    xero.fetchInvoices.mockResolvedValue([]);
    await Promise.all([syncFromXero(), syncFromXero(), syncFromXero()]);
    expect(xero.fetchInvoices).toHaveBeenCalledTimes(1);
  });
});
