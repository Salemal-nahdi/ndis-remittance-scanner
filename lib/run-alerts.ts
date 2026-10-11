import "server-only";
import { ageReceivables } from "./aging";
import { alertStatus, nextAlertState, pendingAlerts } from "./alerts";
import { todayISO } from "./dates";
import { alertEmail, sendEmail } from "./email";
import { readStore, updateStore } from "./store";
import { syncFromXero } from "./sync";

/**
 * Refreshes from Xero, emails any newly overdue clients to the nominated
 * addresses, and remembers what was sent so each invoice is only emailed once.
 */
export async function runAlertCheck(): Promise<{ sent: number; error?: string }> {
  const today = todayISO();
  const at = new Date().toISOString();
  try {
    const snapshot = await syncFromXero();
    const { settings, decisions, alertState } = await readStore();
    const rows = ageReceivables(snapshot.invoices, today, settings);
    const pending = pendingAlerts(rows, decisions, alertState, today);

    if (pending.length > 0) {
      if (settings.alertEmails.length === 0) throw new Error("No alert email addresses are set");
      const open = rows.filter((r) => {
        const s = alertStatus(r, decisions[r.contactId]?.at(-1), today);
        return s !== "clear" && s !== "snooze" && s !== "dismiss";
      }).length;
      const { subject, html } = alertEmail(pending, open);
      await sendEmail(settings.alertEmails, subject, html);
    }

    await updateStore((d) => {
      d.alertState = nextAlertState(rows, d.alertState, pending, at);
      d.lastAlertRun = { at, date: today, sent: pending.length };
    });
    return { sent: pending.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await updateStore((d) => {
      d.lastAlertRun = { at, date: today, sent: 0, error };
    });
    return { sent: 0, error };
  }
}
