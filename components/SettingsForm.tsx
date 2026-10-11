"use client";

import { useState, useTransition } from "react";
import { runAlertsNow, saveSettings } from "@/app/actions";

interface Props {
  defaultThresholdDays: number;
  alertEmails: string[];
  lastRun?: { at: string; sent: number; error?: string };
  connected: boolean;
  alertHour: number;
}

export function SettingsForm(props: Props) {
  const [days, setDays] = useState(String(props.defaultThresholdDays));
  const [emails, setEmails] = useState(props.alertEmails.join("\n"));
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await saveSettings({ defaultThresholdDays: Number(days), alertEmails: emails.split(/[\n,;]+/) });
      setMessage(res.error ? { error: res.error } : { ok: "Settings saved" });
    });

  const run = () =>
    start(async () => {
      const res = await runAlertsNow();
      setMessage(res.error ? { error: res.error } : { ok: res.sent ? `Alert email sent for ${res.sent} client(s)` : "No newly overdue clients, so no email was needed" });
    });

  const hour = new Date(2000, 0, 1, props.alertHour).toLocaleTimeString("en-AU", { hour: "numeric" });

  return (
    <div className="card">
      <label htmlFor="days">
        Overdue threshold <span className="hint">(days past the invoice due date)</span>
      </label>
      <input id="days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 90 }} /> days
      <p className="hint">You can set a different threshold for a particular client on the overdue payments page.</p>

      <label htmlFor="emails">
        Send alert emails to <span className="hint">(one address per line)</span>
      </label>
      <textarea id="emails" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} style={{ width: "100%", maxWidth: 420 }}
        placeholder="accounts@yourbusiness.com.au" />
      <p className="hint">
        Checked every day after {hour}. An email goes out only when a client newly passes the threshold, and each invoice
        is only emailed about once.
      </p>

      <div className="toolbar">
        <button className="primary" disabled={pending} onClick={save}>Save settings</button>
        <button disabled={pending || !props.connected} onClick={run}>Check and send alerts now</button>
      </div>
      {message.error && <p className="error">{message.error}</p>}
      {message.ok && <p className="success">{message.ok}</p>}
      {props.lastRun && (
        <p className="hint">
          Last check {new Date(props.lastRun.at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}:{" "}
          {props.lastRun.error ? <span className="error">failed – {props.lastRun.error}</span> : `${props.lastRun.sent} client(s) emailed`}
        </p>
      )}
    </div>
  );
}
