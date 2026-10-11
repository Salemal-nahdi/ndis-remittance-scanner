import type { ContactAging } from "./aging";

export type DecisionAction = "follow_up" | "hold" | "snooze" | "dismiss";

export const DECISION_LABELS: Record<DecisionAction, string> = {
  follow_up: "Following up",
  hold: "Services on hold",
  snooze: "Snoozed",
  dismiss: "Dismissed",
};

export interface Decision {
  action: DecisionAction;
  note: string;
  by: string;
  /** ISO timestamp */
  at: string;
  /** YYYY-MM-DD, for snooze */
  snoozeUntil?: string;
  /** Overdue invoices at the time of the decision. */
  invoiceIds: string[];
}

export interface AlertState {
  /** Invoices already included in an email, so each is only emailed once. */
  notifiedInvoiceIds: string[];
  lastNotifiedAt?: string;
}

export type AlertStatus = "clear" | "overdue" | DecisionAction;

function overdueIds(row: ContactAging): string[] {
  return row.invoices.filter((i) => i.overThreshold).map((i) => i.invoiceId);
}

/**
 * Where a contact stands. A snooze lasts until its date; a dismissal lasts until
 * another invoice goes past the threshold. "Follow up" and "hold" keep the
 * contact on the list until the overdue balance is paid.
 */
export function alertStatus(row: ContactAging, latest: Decision | undefined, today: string): AlertStatus {
  const ids = overdueIds(row);
  if (ids.length === 0) return "clear";
  if (!latest) return "overdue";
  if (latest.action === "snooze") {
    return latest.snoozeUntil && latest.snoozeUntil > today ? "snooze" : "overdue";
  }
  if (latest.action === "dismiss") {
    return ids.every((id) => latest.invoiceIds.includes(id)) ? "dismiss" : "overdue";
  }
  return latest.action;
}

export interface PendingAlert {
  row: ContactAging;
  newInvoiceIds: string[];
}

/**
 * Contacts to include in the next email: those with an invoice that has gone
 * past the threshold since the last email and isn't snoozed or dismissed.
 */
export function pendingAlerts(
  rows: ContactAging[],
  decisions: Record<string, Decision[]>,
  state: Record<string, AlertState>,
  today: string,
): PendingAlert[] {
  const pending: PendingAlert[] = [];
  for (const row of rows) {
    const status = alertStatus(row, decisions[row.contactId]?.at(-1), today);
    if (status === "clear" || status === "snooze" || status === "dismiss") continue;
    const already = new Set(state[row.contactId]?.notifiedInvoiceIds ?? []);
    const newInvoiceIds = overdueIds(row).filter((id) => !already.has(id));
    if (newInvoiceIds.length > 0) pending.push({ row, newInvoiceIds });
  }
  return pending.sort((a, b) => b.row.overThresholdCents - a.row.overThresholdCents);
}

/**
 * Alert state after a run: notified invoices are remembered, and contacts whose
 * overdue invoices have all been paid are cleared so a future overdue invoice
 * alerts again.
 */
export function nextAlertState(
  rows: ContactAging[],
  state: Record<string, AlertState>,
  sent: PendingAlert[],
  nowIso: string,
): Record<string, AlertState> {
  const next: Record<string, AlertState> = {};
  const sentIds = new Set(sent.map((p) => p.row.contactId));
  for (const row of rows) {
    const ids = overdueIds(row);
    if (ids.length === 0) continue;
    const prev = state[row.contactId];
    const remembered = (prev?.notifiedInvoiceIds ?? []).filter((id) => ids.includes(id));
    if (sentIds.has(row.contactId)) {
      next[row.contactId] = { notifiedInvoiceIds: ids, lastNotifiedAt: nowIso };
    } else if (remembered.length > 0) {
      next[row.contactId] = { notifiedInvoiceIds: remembered, lastNotifiedAt: prev?.lastNotifiedAt };
    }
  }
  return next;
}
