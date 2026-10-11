import "server-only";
import { ageReceivables } from "./aging";
import { alertStatus, nextAlertState, pendingAlerts } from "./alerts";
import { todayISO } from "./dates";
import { alertEmail, sendEmail } from "./email";
import { LOCKS, sql } from "./db";
import { getAlertState, getDecisions, getPayers, getSettings, getUnpaidInvoices, recordAlertRun, replaceAlertState } from "./store";
import { syncFromXero } from "./sync";

/**
 * Refreshes from Xero, emails any newly overdue clients to the nominated
 * addresses, and remembers what was sent so each invoice is only emailed once.
 */
export async function runAlertCheck(): Promise<{ sent: number; error?: string; skipped?: boolean }> {
  const today = todayISO();
  const at = new Date().toISOString();
  try {
    // The lock stops a scheduled run and a "send now" click from emailing the same clients twice.
    return await sql.begin(async (tx) => {
      const [{ locked }] = await tx<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(${LOCKS.alertRun}) as locked`;
      if (!locked) return { sent: 0, skipped: true };

      await syncFromXero();
      const unpaid = (await getUnpaidInvoices())?.unpaidInvoices ?? [];
      const [settings, decisions, alertState] = await Promise.all([getSettings(), getDecisions(), getAlertState(tx)]);
      const rows = ageReceivables(unpaid, today, settings);
      const pending = pendingAlerts(rows, decisions, alertState, today);

      if (pending.length > 0) {
        if (settings.alertEmails.length === 0) throw new Error("No alert email addresses are set");
        const open = rows.filter((r) => {
          const s = alertStatus(r, decisions[r.contactId]?.at(-1), today);
          return s !== "clear" && s !== "snooze" && s !== "dismiss";
        }).length;
        const { subject, html } = alertEmail(pending, open, await getPayers());
        await sendEmail(settings.alertEmails, subject, html);
      }

      await replaceAlertState(nextAlertState(rows, alertState, pending, at), tx);
      await recordAlertRun({ at, date: today, sent: pending.length }, tx);
      return { sent: pending.length };
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordAlertRun({ at, date: today, sent: 0, error });
    return { sent: 0, error };
  }
}
