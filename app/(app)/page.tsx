import Link from "next/link";
import { NotConnected } from "@/components/NotConnected";
import { RefreshButton } from "@/components/RefreshButton";
import { ageReceivables } from "@/lib/aging";
import { alertStatus } from "@/lib/alerts";
import { todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getDecisions, getNotDuplicates, getOverviewData, getSettings } from "@/lib/store";
import { ensureXeroData } from "@/lib/sync";

export default async function Overview() {
  const data = (await ensureXeroData()) ? await getOverviewData() : null;
  if (!data) {
    return (
      <>
        <h1>Welcome</h1>
        <p className="sub">Reconcile NDIS remittances, chase overdue payments and tidy up client records in Xero.</p>
        <NotConnected />
      </>
    );
  }
  const [settings, decisions, notDuplicates] = await Promise.all([getSettings(), getDecisions(), getNotDuplicates()]);
  const today = todayISO();
  const rows = ageReceivables(data.unpaidInvoices, today, settings);
  const needsDecision = rows.filter((r) => alertStatus(r, decisions[r.contactId]?.at(-1), today) === "overdue");
  const duplicates = data.clusterKeys.filter((key) => !notDuplicates.includes(key));

  return (
    <>
      <h1>Overview</h1>
      <p className="sub"><RefreshButton syncedAt={data.syncedAt} /></p>
      <div className="stats">
        <Link href="/receivables" className="stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="stat-label">Clients needing a decision</div>
          <div className="stat-value">{needsDecision.length}</div>
          <div className="hint">{formatCents(needsDecision.reduce((t, r) => t + r.overThresholdCents, 0))} past {settings.defaultThresholdDays} days</div>
        </Link>
        <Link href="/contacts" className="stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="stat-label">Possible duplicate contacts</div>
          <div className="stat-value">{duplicates.length}</div>
          <div className="hint">groups to review</div>
        </Link>
        <div className="stat">
          <div className="stat-label">Total unpaid</div>
          <div className="stat-value">{formatCents(rows.reduce((t, r) => t + r.totalDueCents, 0))}</div>
          <div className="hint">{rows.length} clients</div>
        </div>
      </div>
      {settings.alertEmails.length === 0 && (
        <div className="card">
          Overdue alert emails aren&apos;t set up yet. <Link href="/settings">Add an email address in Settings</Link>.
        </div>
      )}
      <div className="card hint">Remittance scanning is coming next, once the sample emails have been analysed.</div>
    </>
  );
}
