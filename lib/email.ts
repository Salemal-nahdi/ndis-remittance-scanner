import "server-only";
import nodemailer from "nodemailer";
import type { PendingAlert } from "./alerts";
import { formatCents } from "./money";
import { payerLabel, type Payer } from "./payers";

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function alertEmail(pending: PendingAlert[], openCount: number, payers: Record<string, Payer> = {}) {
  const url = `${process.env.APP_URL}/receivables`;
  const rows = pending
    .map(({ row }) => {
      const oldest = row.invoices[0];
      return `<tr>
        <td style="padding:6px 10px">${escape(row.contactName)}</td>
        <td style="padding:6px 10px">${escape(payerLabel(payers[row.contactId]))}</td>
        <td style="padding:6px 10px;text-align:right">${formatCents(row.overThresholdCents)}</td>
        <td style="padding:6px 10px;text-align:right">${row.oldestDaysOverdue} days</td>
        <td style="padding:6px 10px">${escape(oldest?.invoiceNumber ?? "")}</td>
      </tr>`;
    })
    .join("");
  const n = pending.length;
  const subject = `${n} participant${n === 1 ? "" : "s"} newly overdue past the payment threshold`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#1f2933">
    <p>${n === 1 ? "This participant has" : "These participants have"} gone past the overdue threshold since the last alert.
    Decide what to do for each one on the overdue payments page.</p>
    <table style="border-collapse:collapse;border:1px solid #d9e2ec">
      <thead style="background:#f0f4f8"><tr>
        <th style="padding:6px 10px;text-align:left">Participant</th>
        <th style="padding:6px 10px;text-align:left">Paid by</th>
        <th style="padding:6px 10px;text-align:right">Overdue amount</th>
        <th style="padding:6px 10px;text-align:right">Oldest invoice</th>
        <th style="padding:6px 10px;text-align:left">Oldest invoice number</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>${openCount} participant${openCount === 1 ? " is" : "s are"} past the threshold in total.</p>
    <p><a href="${url}">Open overdue payments</a></p>
  </div>`;
  return { subject, html };
}

export async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.ALERT_FROM ?? process.env.SMTP_USER, to, subject, html });
}
