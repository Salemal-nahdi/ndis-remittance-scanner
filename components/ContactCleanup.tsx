"use client";

import { Fragment, useCallback, useOptimistic, useState, useTransition } from "react";
import { markNotDuplicates } from "@/app/actions";
import type { DuplicateCluster } from "@/lib/duplicates";
import { formatCents } from "@/lib/money";
import { useSort } from "./useSort";

export interface ContactRow {
  contactId: string;
  name: string;
  email: string;
  ndisNumber: string;
  archived: boolean;
  invoiceCount: number;
  unpaidCents: number;
}
export interface ClusterRow extends DuplicateCluster {
  members: ContactRow[];
}

const xeroContact = (id: string) => `https://go.xero.com/Contacts/View/${id}`;

type ClusterKey = "names" | "confidence" | "size" | "invoices" | "unpaid";
type ContactKey = "name" | "email" | "invoices" | "unpaid";

export function ContactCleanup({ clusters, missingNdis }: { clusters: ClusterRow[]; missingNdis: ContactRow[] }) {
  const [tab, setTab] = useState<"duplicates" | "ndis">("duplicates");
  return (
    <>
      <div className="toolbar" role="tablist">
        <button role="tab" aria-selected={tab === "duplicates"} className={tab === "duplicates" ? "primary" : ""} onClick={() => setTab("duplicates")}>
          Possible duplicates ({clusters.length})
        </button>
        <button role="tab" aria-selected={tab === "ndis"} className={tab === "ndis" ? "primary" : ""} onClick={() => setTab("ndis")}>
          Missing NDIS number ({missingNdis.length})
        </button>
      </div>
      {tab === "duplicates" ? <Duplicates clusters={clusters} /> : <MissingNdis rows={missingNdis} />}
    </>
  );
}

function Duplicates({ clusters: savedClusters }: { clusters: ClusterRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  // A group marked "different clients" disappears at once while it saves.
  const [clusters, hide] = useOptimistic(savedClusters, (current: ClusterRow[], key: string) => current.filter((c) => c.key !== key));
  const [, start] = useTransition();
  const [error, setError] = useState("");
  const getValue = useCallback((c: ClusterRow, key: ClusterKey) => {
    switch (key) {
      case "names": return c.members[0]?.name;
      case "confidence": return c.confidence === "high" ? 1 : 0;
      case "size": return c.members.length;
      case "invoices": return c.members.reduce((t, m) => t + m.invoiceCount, 0);
      case "unpaid": return c.members.reduce((t, m) => t + m.unpaidCents, 0);
    }
  }, []);
  const { sorted, header } = useSort<ClusterRow, ClusterKey>(clusters, getValue, { key: "confidence", dir: "desc" });

  return (
    <>
      {error && <p className="error" role="status">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {header("names", "Contacts")}
              <th>Why they were flagged</th>
              {header("confidence", "Confidence", { numeric: true })}
              {header("size", "Contacts in group", { numeric: true })}
              {header("invoices", "Invoices", { numeric: true })}
              {header("unpaid", "Unpaid", { numeric: true })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={6} className="hint">No likely duplicates found.</td></tr>}
            {sorted.map((c) => (
              <Fragment key={c.key}>
                <tr className={`clickable${open === c.key ? " expanded" : ""}`} onClick={() => setOpen(open === c.key ? null : c.key)}>
                  <td className="wrap">{c.members.map((m) => m.name).join(" · ")}</td>
                  <td className="wrap">{c.reasons.join("; ")}</td>
                  <td className="num"><span className={`badge ${c.confidence === "high" ? "danger" : "warn"}`}>{c.confidence}</span></td>
                  <td className="num">{c.members.length}</td>
                  <td className="num">{getValue(c, "invoices")}</td>
                  <td className="num">{formatCents(getValue(c, "unpaid") as number)}</td>
                </tr>
                {open === c.key && (
                  <tr>
                    <td colSpan={6} className="wrap">
                      <MemberTable rows={c.members} />
                      <p className="hint">
                        Keep the contact with the most invoices, then open the others in Xero and use Options → Merge to
                        merge them into it (Xero doesn't let apps merge contacts).
                      </p>
                      <button
                        onClick={() =>
                          start(async () => {
                            setError("");
                            hide(c.key);
                            try {
                              await markNotDuplicates(c.key);
                            } catch {
                              setError("Couldn't save that change. Check your connection and try again.");
                            }
                          })
                        }
                      >
                        These are different clients
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Click a group to compare the contacts.</p>
    </>
  );
}

function MemberTable({ rows }: { rows: ContactRow[] }) {
  const getValue = useCallback((r: ContactRow, key: ContactKey | "ndis") => {
    switch (key) {
      case "name": return r.name;
      case "email": return r.email;
      case "ndis": return r.ndisNumber;
      case "invoices": return r.invoiceCount;
      case "unpaid": return r.unpaidCents;
    }
  }, []);
  const { sorted, header } = useSort<ContactRow, ContactKey | "ndis">(rows, getValue, { key: "invoices", dir: "desc" });
  return (
    <table>
      <thead>
        <tr>
          {header("name", "Name")}
          {header("ndis", "NDIS number")}
          {header("email", "Email")}
          {header("invoices", "Invoices", { numeric: true })}
          {header("unpaid", "Unpaid", { numeric: true })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((m) => (
          <tr key={m.contactId}>
            <td>
              <a href={xeroContact(m.contactId)} target="_blank" rel="noreferrer">{m.name}</a>
              {m.archived && <span className="badge muted" style={{ marginLeft: 6 }}>archived</span>}
            </td>
            <td>{m.ndisNumber || "–"}</td>
            <td>{m.email || "–"}</td>
            <td className="num">{m.invoiceCount}</td>
            <td className="num">{formatCents(m.unpaidCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MissingNdis({ rows }: { rows: ContactRow[] }) {
  const getValue = useCallback((r: ContactRow, key: ContactKey) => {
    switch (key) {
      case "name": return r.name;
      case "email": return r.email;
      case "invoices": return r.invoiceCount;
      case "unpaid": return r.unpaidCents;
    }
  }, []);
  const { sorted, header } = useSort<ContactRow, ContactKey>(rows, getValue, { key: "name", dir: "asc" });
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {header("name", "Client")}
              {header("email", "Email")}
              {header("invoices", "Invoices", { numeric: true })}
              {header("unpaid", "Unpaid", { numeric: true })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={4} className="hint">Every client has an NDIS number.</td></tr>}
            {sorted.map((m) => (
              <tr key={m.contactId}>
                <td><a href={xeroContact(m.contactId)} target="_blank" rel="noreferrer">{m.name}</a></td>
                <td>{m.email || "–"}</td>
                <td className="num">{m.invoiceCount}</td>
                <td className="num">{formatCents(m.unpaidCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Looks for a 9-digit NDIS number starting with 43 in the contact&apos;s account number or name. Organisations such as
        plan managers are left out.
      </p>
    </>
  );
}
