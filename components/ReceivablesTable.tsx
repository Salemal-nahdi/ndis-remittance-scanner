"use client";

import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
import { recordDecision, setContactThreshold, setParticipantPayer } from "@/app/actions";
import { BUCKETS, type ContactAging } from "@/lib/aging";
import { DECISION_LABELS, type AlertStatus, type Decision, type DecisionAction } from "@/lib/alerts";
import { formatCents } from "@/lib/money";
import { PAYER_TYPE_LABELS, payerLabel, type Payer, type PayerType } from "@/lib/payers";
import { useSort } from "./useSort";

export interface ReceivableRow extends ContactAging {
  hasOverride: boolean;
  status: AlertStatus;
  history: Decision[];
  payer?: Payer;
}

type Filter = "attention" | "handled" | "all";
type Key = "name" | "payer" | "status" | "oldest" | "over" | "total" | "threshold" | (typeof BUCKETS)[number];

const STATUS_ORDER: Record<AlertStatus, number> = { overdue: 0, hold: 1, follow_up: 2, snooze: 3, dismiss: 4, clear: 5 };

function StatusBadge({ status, snoozeUntil }: { status: AlertStatus; snoozeUntil?: string }) {
  if (status === "clear") return <span className="badge ok">Within terms</span>;
  if (status === "overdue") return <span className="badge danger">Needs decision</span>;
  if (status === "hold") return <span className="badge danger">{DECISION_LABELS.hold}</span>;
  if (status === "snooze") return <span className="badge muted">Snoozed to {snoozeUntil}</span>;
  return <span className={`badge ${status === "follow_up" ? "warn" : "muted"}`}>{DECISION_LABELS[status]}</span>;
}

interface Props {
  rows: ReceivableRow[];
  today: string;
  /** Plan manager names already in use, offered when setting a participant's payer. */
  planManagers: string[];
}

export function ReceivablesTable({ rows, today, planManagers }: Props) {
  const [filter, setFilter] = useState<Filter>("attention");
  const [view, setView] = useState<"participants" | "payers">("participants");
  const [payerFilter, setPayerFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const inFilter = rows.filter((r) =>
    filter === "all" ? true : filter === "attention" ? r.status === "overdue" : r.status !== "overdue" && r.status !== "clear",
  );
  const visible = payerFilter ? inFilter.filter((r) => payerLabel(r.payer) === payerFilter) : inFilter;

  const getValue = useCallback((r: ReceivableRow, key: Key) => {
    switch (key) {
      case "name": return r.contactName;
      case "payer": return payerLabel(r.payer);
      case "status": return STATUS_ORDER[r.status];
      case "oldest": return r.oldestDaysOverdue;
      case "over": return r.overThresholdCents;
      case "total": return r.totalDueCents;
      case "threshold": return r.thresholdDays;
      default: return r.buckets[key];
    }
  }, []);
  const { sorted, header } = useSort<ReceivableRow, Key>(visible, getValue, { key: "oldest", dir: "desc" });

  const counts = {
    attention: rows.filter((r) => r.status === "overdue").length,
    handled: rows.filter((r) => r.status !== "overdue" && r.status !== "clear").length,
    all: rows.length,
  };

  return (
    <>
      <div className="toolbar" role="tablist">
        {(["attention", "handled", "all"] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "primary" : ""} onClick={() => setFilter(f)}>
            {{ attention: "Needs a decision", handled: "Decided", all: "All unpaid" }[f]} ({counts[f]})
          </button>
        ))}
        <span style={{ marginLeft: "auto" }} className="hint">Show by</span>
        <button className={view === "participants" ? "primary" : ""} onClick={() => setView("participants")}>Participant</button>
        <button className={view === "payers" ? "primary" : ""} onClick={() => setView("payers")}>Who pays</button>
      </div>
      {flash && <p className="success" role="status">{flash}</p>}
      {view === "payers" ? (
        <PayerTable
          rows={inFilter}
          onPick={(label) => {
            setPayerFilter(label);
            setView("participants");
          }}
        />
      ) : (
      <>
      {payerFilter && (
        <p>
          Showing participants paid by <strong>{payerFilter}</strong>{" "}
          <button onClick={() => setPayerFilter(null)}>Show everyone</button>
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {header("name", "Participant")}
              {header("payer", "Paid by")}
              {header("status", "Status")}
              {header("oldest", "Oldest (days overdue)", { numeric: true })}
              {header("over", "Past threshold", { numeric: true })}
              {BUCKETS.map((b) => <Fragment key={b}>{header(b, b === "current" ? "Not yet due" : `${b} days`, { numeric: true })}</Fragment>)}
              {header("total", "Total unpaid", { numeric: true })}
              {header("threshold", "Threshold", { numeric: true })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={12} className="hint">Nothing here.</td></tr>
            )}
            {sorted.map((r) => (
              <Fragment key={r.contactId}>
                <tr className={`clickable${open === r.contactId ? " expanded" : ""}`} onClick={() => setOpen(open === r.contactId ? null : r.contactId)}>
                  <td>{r.contactName}</td>
                  <td className={r.payer ? "" : "hint"}>{payerLabel(r.payer)}</td>
                  <td><StatusBadge status={r.status} snoozeUntil={r.history.at(-1)?.snoozeUntil} /></td>
                  <td className="num">{Math.max(0, r.oldestDaysOverdue)}</td>
                  <td className="num">{r.overThresholdCents ? formatCents(r.overThresholdCents) : "–"}</td>
                  {BUCKETS.map((b) => <td key={b} className="num">{r.buckets[b] ? formatCents(r.buckets[b]) : "–"}</td>)}
                  <td className="num">{formatCents(r.totalDueCents)}</td>
                  <td className="num">{r.thresholdDays} days{r.hasOverride ? "*" : ""}</td>
                </tr>
                {open === r.contactId && (
                  <tr><td colSpan={12} className="wrap"><ContactDetail row={r} today={today} onSaved={setFlash} planManagers={planManagers} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">* This participant has their own threshold. Click a participant to see invoices, set who pays and record a decision.</p>
      </>
      )}
    </>
  );
}

type PayerKey = "payer" | "participants" | "attention" | "over" | "total" | "oldest";
interface PayerRow {
  label: string;
  participants: number;
  attention: number;
  overCents: number;
  totalCents: number;
  oldest: number;
}

/** Totals per payer, to spot a plan manager who is behind across several participants. */
function PayerTable({ rows, onPick }: { rows: ReceivableRow[]; onPick: (label: string) => void }) {
  const byPayer = new Map<string, PayerRow>();
  for (const r of rows) {
    const label = payerLabel(r.payer);
    const p = byPayer.get(label) ?? { label, participants: 0, attention: 0, overCents: 0, totalCents: 0, oldest: 0 };
    p.participants++;
    if (r.status === "overdue") p.attention++;
    p.overCents += r.overThresholdCents;
    p.totalCents += r.totalDueCents;
    p.oldest = Math.max(p.oldest, r.oldestDaysOverdue);
    byPayer.set(label, p);
  }
  const getValue = useCallback((p: PayerRow, key: PayerKey) => {
    switch (key) {
      case "payer": return p.label;
      case "participants": return p.participants;
      case "attention": return p.attention;
      case "over": return p.overCents;
      case "total": return p.totalCents;
      case "oldest": return p.oldest;
    }
  }, []);
  const { sorted, header } = useSort<PayerRow, PayerKey>([...byPayer.values()], getValue, { key: "over", dir: "desc" });

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {header("payer", "Paid by")}
              {header("participants", "Participants", { numeric: true })}
              {header("attention", "Needing a decision", { numeric: true })}
              {header("over", "Past threshold", { numeric: true })}
              {header("total", "Total unpaid", { numeric: true })}
              {header("oldest", "Oldest (days overdue)", { numeric: true })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={6} className="hint">Nothing here.</td></tr>}
            {sorted.map((p) => (
              <tr key={p.label} className="clickable" onClick={() => onPick(p.label)}>
                <td>{p.label}</td>
                <td className="num">{p.participants}</td>
                <td className="num">{p.attention || "–"}</td>
                <td className="num">{p.overCents ? formatCents(p.overCents) : "–"}</td>
                <td className="num">{formatCents(p.totalCents)}</td>
                <td className="num">{Math.max(0, p.oldest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Click a payer to see their participants. Set who pays from each participant&apos;s details.</p>
    </>
  );
}

function PayerEditor({ row, planManagers }: { row: ReceivableRow; planManagers: string[] }) {
  const [type, setType] = useState<PayerType | "">(row.payer?.type ?? "");
  const [manager, setManager] = useState(row.payer?.planManager ?? "");
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const listId = `plan-managers-${row.contactId}`;

  const save = () =>
    start(async () => {
      const res = await setParticipantPayer(row.contactId, type ? { type, planManager: manager } : null);
      setMessage(res.error ? { error: res.error } : { ok: "Saved" });
    });

  return (
    <>
      <label htmlFor={`payer-${row.contactId}`}>Who pays this participant&apos;s invoices</label>
      <select id={`payer-${row.contactId}`} value={type} onChange={(e) => setType(e.target.value as PayerType | "")}>
        <option value="">Not set</option>
        {(Object.keys(PAYER_TYPE_LABELS) as PayerType[]).map((t) => (
          <option key={t} value={t}>{PAYER_TYPE_LABELS[t]}</option>
        ))}
      </select>{" "}
      {type === "plan_managed" && (
        <>
          <input list={listId} value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Plan manager's name" />
          <datalist id={listId}>{planManagers.map((m) => <option key={m} value={m} />)}</datalist>{" "}
        </>
      )}
      <button disabled={pending} onClick={save}>Save</button>
      {message.error && <p className="error">{message.error}</p>}
      {message.ok && <span className="success"> {message.ok}</span>}
    </>
  );
}

function ContactDetail({ row, today, onSaved, planManagers }: {
  row: ReceivableRow;
  today: string;
  onSaved: (message: string) => void;
  planManagers: string[];
}) {
  const [action, setAction] = useState<DecisionAction>("follow_up");
  const [note, setNote] = useState("");
  const [by, setBy] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [threshold, setThreshold] = useState(String(row.thresholdDays));
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    try { setBy(localStorage.getItem("decidedBy") ?? ""); } catch {}
  }, []);

  const save = () =>
    start(async () => {
      try { localStorage.setItem("decidedBy", by); } catch {}
      const res = await recordDecision({
        contactId: row.contactId, action, note, by, snoozeUntil: snoozeUntil || undefined,
        invoiceIds: row.invoices.filter((i) => i.overThreshold).map((i) => i.invoiceId),
      });
      if (res.error) return setMessage({ error: res.error });
      setMessage({ ok: "Saved" });
      setNote("");
      // The client may move to the "Decided" list, closing this panel, so confirm above the table too.
      onSaved(`${row.contactName}: ${DECISION_LABELS[action].toLowerCase()}${action === "snooze" ? ` until ${snoozeUntil}` : ""}. Saved under "Decided".`);
    });

  return (
    <div className="detail">
      <div>
        <strong>Unpaid invoices</strong>
        <table>
          <thead><tr><th>Invoice</th><th>Due</th><th className="num">Days overdue</th><th className="num">Amount due</th></tr></thead>
          <tbody>
            {row.invoices.map((i) => (
              <tr key={i.invoiceId}>
                <td>
                  <a href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${i.invoiceId}`} target="_blank" rel="noreferrer">
                    {i.invoiceNumber || "(no number)"}
                  </a>
                </td>
                <td>{i.dueDate ?? "–"}</td>
                <td className="num">{i.overThreshold ? <span className="badge danger">{i.daysOverdue}</span> : Math.max(0, i.daysOverdue)}</td>
                <td className="num">{formatCents(i.amountDueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <label>
          Overdue threshold for this participant <span className="hint">(days past due date before alerting)</span>
        </label>
        <input type="number" min={1} max={365} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ width: 90 }} />{" "}
        <button disabled={pending} onClick={() => start(() => setContactThreshold(row.contactId, Number(threshold)))}>Save</button>{" "}
        {row.hasOverride && <button disabled={pending} onClick={() => start(() => setContactThreshold(row.contactId, null))}>Use default</button>}
        <PayerEditor row={row} planManagers={planManagers} />
      </div>
      <div>
        {row.status !== "clear" && (
          <>
            <strong>What do you want to do?</strong>
            <div className="toolbar" style={{ marginTop: 8 }}>
              {(Object.keys(DECISION_LABELS) as DecisionAction[]).map((a) => (
                <button key={a} className={action === a ? "primary" : ""} onClick={() => setAction(a)}>
                  {{ follow_up: "Follow up", hold: "Put services on hold", snooze: "Snooze", dismiss: "Dismiss" }[a]}
                </button>
              ))}
            </div>
            {action === "snooze" && (
              <>
                <label htmlFor="snooze">Snooze until</label>
                <input id="snooze" type="date" min={today} value={snoozeUntil} onChange={(e) => setSnoozeUntil(e.target.value)} />
              </>
            )}
            {action === "dismiss" && <p className="hint">Hidden until another invoice for this client goes past the threshold.</p>}
            <label htmlFor="note">Note</label>
            <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }}
              placeholder="e.g. Emailed plan manager, promised payment Friday" />
            <label htmlFor="by">Your name</label>
            <input id="by" value={by} onChange={(e) => setBy(e.target.value)} />{" "}
            <button className="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save decision"}</button>
            {message.error && <p className="error">{message.error}</p>}
            {message.ok && <p className="success">{message.ok}</p>}
          </>
        )}
        {row.history.length > 0 && (
          <>
            <p style={{ marginTop: 16 }}><strong>History</strong></p>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {[...row.history].reverse().map((d, i) => (
                <li key={i}>
                  {new Date(d.at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}: {DECISION_LABELS[d.action]}
                  {d.snoozeUntil ? ` until ${d.snoozeUntil}` : ""} by {d.by}
                  {d.note && <span className="hint"> – {d.note}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
