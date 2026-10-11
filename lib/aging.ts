import { daysBetween } from "./dates";

export interface UnpaidInvoice {
  invoiceId: string;
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  amountDueCents: number;
}

export const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export interface AgedInvoice extends UnpaidInvoice {
  daysOverdue: number;
  bucket: Bucket;
  overThreshold: boolean;
}

export interface ContactAging {
  contactId: string;
  contactName: string;
  thresholdDays: number;
  totalDueCents: number;
  buckets: Record<Bucket, number>;
  oldestDaysOverdue: number;
  /** Sum of invoices at or past the threshold. */
  overThresholdCents: number;
  invoices: AgedInvoice[];
}

export interface AgingSettings {
  defaultThresholdDays: number;
  /** contactId -> threshold days for that contact. */
  overrides: Record<string, number>;
}

/**
 * Groups unpaid invoices by contact and ages them from the due date. An invoice
 * with no due date is aged from its invoice date.
 */
export function ageReceivables(
  invoices: UnpaidInvoice[],
  today: string,
  settings: AgingSettings,
): ContactAging[] {
  const byContact = new Map<string, ContactAging>();

  for (const inv of invoices) {
    if (inv.amountDueCents <= 0) continue;
    const from = inv.dueDate ?? inv.date;
    const daysOverdue = from ? daysBetween(from, today) : 0;
    const thresholdDays = settings.overrides[inv.contactId] ?? settings.defaultThresholdDays;

    let row = byContact.get(inv.contactId);
    if (!row) {
      row = {
        contactId: inv.contactId,
        contactName: inv.contactName,
        thresholdDays,
        totalDueCents: 0,
        buckets: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
        oldestDaysOverdue: 0,
        overThresholdCents: 0,
        invoices: [],
      };
      byContact.set(inv.contactId, row);
    }

    const bucket = bucketFor(daysOverdue);
    const overThreshold = daysOverdue >= thresholdDays;
    row.totalDueCents += inv.amountDueCents;
    row.buckets[bucket] += inv.amountDueCents;
    row.oldestDaysOverdue = Math.max(row.oldestDaysOverdue, daysOverdue);
    if (overThreshold) row.overThresholdCents += inv.amountDueCents;
    row.invoices.push({ ...inv, daysOverdue, bucket, overThreshold });
  }

  for (const row of byContact.values()) {
    row.invoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }
  return [...byContact.values()];
}
