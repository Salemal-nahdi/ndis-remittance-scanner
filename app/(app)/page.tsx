import Link from "next/link";
import { NotConnected } from "@/components/NotConnected";
import { RefreshButton } from "@/components/RefreshButton";
import { ageReceivables } from "@/lib/aging";
import { alertStatus } from "@/lib/alerts";
import { todayISO } from "@/lib/dates";
import { findDuplicateClusters } from "@/lib/duplicates";
import { formatCents } from "@/lib/money";
import { readStore } from "@/lib/store";
import { getSnapshot } from "@/lib/sync";

export default async function Overview() {
  const snapshot = await getSnapshot();
  if (!snapshot) {
    return (
      <>
        <h1>Welcome</h1>
        <p className="sub">Reconcile NDIS remittances, chase overdue payments and tidy up client records in Xero.</p>
        <NotConnected />
      </>
    );
  }
  const { settings, decisions, notDuplicates } = await readStore();
  const today = todayISO();
  const rows = ageReceivables(snapshot.invoices, today, settings);
  const needsDecision = rows.filter((r) => alertStatus(r, decisions[r.contactId]?.at(-1), today) === "overdue");
  const duplicates = findDuplicateClusters(snapshot.contacts).filter((c) => !notDuplicates.includes(c.key));

  return (
    <>
      <h1>Overview</h1>
      <p className="sub"><RefreshButton syncedAt={snapshot.syncedAt} /></p>
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
