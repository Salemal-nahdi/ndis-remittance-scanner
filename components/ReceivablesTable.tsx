"use client";

import { Fragment, useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { recordDecision, setContactThreshold, setParticipantPayer } from "@/app/actions";
import { BUCKETS, ageReceivables, type ContactAging } from "@/lib/aging";
import { DECISION_LABELS, alertStatus, type AlertStatus, type Decision, type DecisionAction } from "@/lib/alerts";
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

/** A change made on this page, shown straight away while it saves. */
type Change = { contactId: string } & (
  | { kind: "decision"; decision: Decision }
  | { kind: "payer"; payer?: Payer }
  | { kind: "threshold"; days: number | null }
);
/** Shows a change on screen immediately, saves it, and returns an error message if saving failed. */
type Save = (change: Change, action: () => Promise<{ error?: string } | void>) => Promise<string | undefined>;

function applyChange(row: ReceivableRow, change: Change, today: string, defaultThresholdDays: number): ReceivableRow {
  switch (change.kind) {
    case "decision": {
      const history = [...row.history, change.decision];
      return { ...row, history, status: alertStatus(row, change.decision, today) };
    }
    case "payer":
      return { ...row, payer: change.payer };
    case "threshold": {
      const days = change.days ?? defaultThresholdDays;
      const [aged] = ageReceivables(row.invoices, today, { defaultThresholdDays: days, overrides: {} });
      return { ...row, ...aged, hasOverride: change.days !== null, status: alertStatus(aged, row.history.at(-1), today) };
    }
  }
}
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
  defaultThresholdDays: number;
  /** Plan manager names already in use, offered when setting a participant's payer. */
  planManagers: string[];
}

export function ReceivablesTable({ rows: savedRows, today, defaultThresholdDays, planManagers }: Props) {
  // Changes show at once; when the save finishes the page's fresh data takes over,
  // and if the save failed the change is rolled back.
  const [rows, addChange] = useOptimistic(savedRows, (current: ReceivableRow[], change: Change) =>
    current.map((r) => (r.contactId === change.contactId ? applyChange(r, change, today, defaultThresholdDays) : r)),
  );
  const [, startSave] = useTransition();
  const save: Save = (change, action) =>
    new Promise((resolve) =>
      startSave(async () => {
        addChange(change);
        let error: string | undefined;
        try {
          error = (await action())?.error;
        } catch {
          // Lost connection or server error: the change is rolled back when this ends.
          error = "Couldn't save that change. Check your connection and try again.";
        }
        if (error) setFlash({ text: error, error: true });
        resolve(error);
      }),
    );

  const [filter, setFilter] = useState<Filter>("attention");
  const [view, setView] = useState<"participants" | "payers">("participants");
  const [payerFilter, setPayerFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);

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
      {flash && <p className={flash.error ? "error" : "success"} role="status">{flash.text}</p>}
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
                  <tr><td colSpan={12} className="wrap"><ContactDetail row={r} today={today} save={save} onSaved={(text) => setFlash({ text })} planManagers={planManagers} /></td></tr>
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

function PayerEditor({ row, planManagers, save }: { row: ReceivableRow; planManagers: string[]; save: Save }) {
  const [type, setType] = useState<PayerType | "">(row.payer?.type ?? "");
  const [manager, setManager] = useState(row.payer?.planManager ?? "");
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const listId = `plan-managers-${row.contactId}`;

  const savePayer = async () => {
    if (type === "plan_managed" && !manager.trim()) return setMessage({ error: "Enter the plan manager's name" });
    const payer: Payer | undefined = type ? { type, planManager: type === "plan_managed" ? manager.trim() : undefined } : undefined;
    setMessage({ ok: "Saved" });
    const error = await save({ contactId: row.contactId, kind: "payer", payer }, () => setParticipantPayer(row.contactId, payer ?? null));
    if (error) setMessage({ error });
  };

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
      <button onClick={savePayer}>Save</button>
      {message.error && <p className="error">{message.error}</p>}
      {message.ok && <span className="success"> {message.ok}</span>}
    </>
  );
}

function ContactDetail({ row, today, save, onSaved, planManagers }: {
  row: ReceivableRow;
  today: string;
  save: Save;
  onSaved: (message: string) => void;
  planManagers: string[];
}) {
  const [action, setAction] = useState<DecisionAction>("follow_up");
  const [note, setNote] = useState("");
  const [by, setBy] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [threshold, setThreshold] = useState(String(row.thresholdDays));
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});

  useEffect(() => {
    try { setBy(localStorage.getItem("decidedBy") ?? ""); } catch {}
  }, []);
  // Keep the box in step when the threshold changes, e.g. after "Use default".
  useEffect(() => setThreshold(String(row.thresholdDays)), [row.thresholdDays]);

  const saveDecision = async () => {
    // Checked here as well as on the server, so a change never shows and then disappears.
    if (!by.trim()) return setMessage({ error: "Enter your name so the team can see who decided" });
    if (action === "snooze" && !snoozeUntil) return setMessage({ error: "Pick a date to snooze until" });
    try { localStorage.setItem("decidedBy", by); } catch {}
    const input = {
      contactId: row.contactId, action, note: note.trim(), by: by.trim(), snoozeUntil: action === "snooze" ? snoozeUntil : undefined,
      invoiceIds: row.invoices.filter((i) => i.overThreshold).map((i) => i.invoiceId),
    };
    setMessage({ ok: "Saved" });
    setNote("");
    // The participant may move to the "Decided" list, closing this panel, so confirm above the table too.
    onSaved(`${row.contactName}: ${DECISION_LABELS[action].toLowerCase()}${action === "snooze" ? ` until ${snoozeUntil}` : ""}. Saved under "Decided".`);
    await save(
      { contactId: row.contactId, kind: "decision", decision: { ...input, at: new Date().toISOString() } },
      () => recordDecision(input),
    );
  };

  const saveThreshold = (days: number | null) => {
    if (days !== null && !(days >= 1 && days <= 365)) return setMessage({ error: "Threshold must be between 1 and 365 days" });
    setMessage({});
    void save({ contactId: row.contactId, kind: "threshold", days }, () => setContactThreshold(row.contactId, days));
  };

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
        <button onClick={() => saveThreshold(Math.round(Number(threshold)))}>Save</button>{" "}
        {row.hasOverride && <button onClick={() => saveThreshold(null)}>Use default</button>}
        <PayerEditor row={row} planManagers={planManagers} save={save} />
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
            {action === "dismiss" && <p className="hint">Hidden until another invoice for this participant goes past the threshold.</p>}
            <label htmlFor="note">Note</label>
            <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }}
              placeholder="e.g. Emailed plan manager, promised payment Friday" />
            <label htmlFor="by">Your name</label>
            <input id="by" value={by} onChange={(e) => setBy(e.target.value)} />{" "}
            <button className="primary" onClick={saveDecision}>Save decision</button>
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
