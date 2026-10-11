import { NotConnected } from "@/components/NotConnected";
import { RefreshButton } from "@/components/RefreshButton";
import { ReceivablesTable, type ReceivableRow } from "@/components/ReceivablesTable";
import { ageReceivables } from "@/lib/aging";
import { alertStatus } from "@/lib/alerts";
import { todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getDecisions, getPayers, getSettings, getUnpaidInvoices } from "@/lib/store";
import { ensureXeroData } from "@/lib/sync";

export default async function ReceivablesPage() {
  if (!(await ensureXeroData())) return <NotConnected />;
  const [data, settings, decisions, payers] = await Promise.all([getUnpaidInvoices(), getSettings(), getDecisions(), getPayers()]);
  if (!data) return <NotConnected />;
  const today = todayISO();

  const rows: ReceivableRow[] = ageReceivables(data.unpaidInvoices, today, settings).map((r) => ({
    ...r,
    hasOverride: r.contactId in settings.overrides,
    status: alertStatus(r, decisions[r.contactId]?.at(-1), today),
    history: decisions[r.contactId] ?? [],
    payer: payers[r.contactId],
  }));
  const planManagers = [...new Set(Object.values(payers).flatMap((p) => (p.planManager ? [p.planManager] : [])))].sort();

  const attention = rows.filter((r) => r.status === "overdue");
  const sum = (list: ReceivableRow[], f: (r: ReceivableRow) => number) => list.reduce((t, r) => t + f(r), 0);

  return (
    <>
      <h1>Overdue payments</h1>
      <p className="sub">
        Participants with invoices {settings.defaultThresholdDays}+ days past their due date (unless they have their own
        threshold). Choose what to do for each one. <RefreshButton syncedAt={data.syncedAt} />
      </p>
      <div className="stats">
        <div className="stat"><div className="stat-label">Needs a decision</div><div className="stat-value">{attention.length}</div></div>
        <div className="stat"><div className="stat-label">Past threshold</div><div className="stat-value">{formatCents(sum(rows, (r) => r.overThresholdCents))}</div></div>
        <div className="stat"><div className="stat-label">Total unpaid</div><div className="stat-value">{formatCents(sum(rows, (r) => r.totalDueCents))}</div></div>
        <div className="stat"><div className="stat-label">Participants with unpaid invoices</div><div className="stat-value">{rows.length}</div></div>
      </div>
      <ReceivablesTable rows={rows} today={today} defaultThresholdDays={settings.defaultThresholdDays} planManagers={planManagers} />
    </>
  );
}
