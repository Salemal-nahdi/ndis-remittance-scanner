"use server";

import { revalidatePath } from "next/cache";
import type { DecisionAction } from "@/lib/alerts";
import { runAlertCheck } from "@/lib/run-alerts";
import type { Payer } from "@/lib/payers";
import { addDecision, addNotDuplicate, saveSettings as saveSettingsRow, setPayer, setThresholdOverride } from "@/lib/store";
import { syncFromXero } from "@/lib/sync";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveSettings(input: { defaultThresholdDays: number; alertEmails: string[] }) {
  const days = Math.round(input.defaultThresholdDays);
  if (!(days >= 1 && days <= 365)) return { error: "Threshold must be between 1 and 365 days" };
  const emails = input.alertEmails.map((e) => e.trim()).filter(Boolean);
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" isn't a valid email address` };
  await saveSettingsRow(days, emails);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setContactThreshold(contactId: string, days: number | null) {
  await setThresholdOverride(contactId, days === null ? null : Math.max(1, Math.min(365, Math.round(days))));
  revalidatePath("/receivables");
}

export async function setParticipantPayer(contactId: string, payer: Payer | null) {
  if (payer?.type === "plan_managed" && !payer.planManager?.trim()) return { error: "Enter the plan manager's name" };
  await setPayer(contactId, payer);
  revalidatePath("/receivables");
  return { ok: true };
}

export async function recordDecision(input: {
  contactId: string;
  action: DecisionAction;
  note: string;
  by: string;
  snoozeUntil?: string;
  invoiceIds: string[];
}) {
  if (!input.by.trim()) return { error: "Enter your name so the team can see who decided" };
  if (input.action === "snooze" && !input.snoozeUntil) return { error: "Pick a date to snooze until" };
  await addDecision(input.contactId, {
    action: input.action,
    note: input.note.trim(),
    by: input.by.trim(),
    snoozeUntil: input.action === "snooze" ? input.snoozeUntil : undefined,
    invoiceIds: input.invoiceIds,
  });
  revalidatePath("/receivables");
  return { ok: true };
}

export async function markNotDuplicates(clusterKey: string) {
  await addNotDuplicate(clusterKey);
  revalidatePath("/contacts");
}

export async function refreshFromXero() {
  await syncFromXero();
  revalidatePath("/", "layout");
}

export async function runAlertsNow() {
  const result = await runAlertCheck();
  revalidatePath("/", "layout");
  return result;
}
