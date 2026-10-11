"use server";

import { revalidatePath } from "next/cache";
import type { Decision, DecisionAction } from "@/lib/alerts";
import { runAlertCheck } from "@/lib/run-alerts";
import { updateStore } from "@/lib/store";
import { syncFromXero } from "@/lib/sync";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveSettings(input: { defaultThresholdDays: number; alertEmails: string[] }) {
  const days = Math.round(input.defaultThresholdDays);
  if (!(days >= 1 && days <= 365)) return { error: "Threshold must be between 1 and 365 days" };
  const emails = input.alertEmails.map((e) => e.trim()).filter(Boolean);
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" isn't a valid email address` };
  await updateStore((d) => {
    d.settings.defaultThresholdDays = days;
    d.settings.alertEmails = emails;
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setContactThreshold(contactId: string, days: number | null) {
  await updateStore((d) => {
    if (days === null) delete d.settings.overrides[contactId];
    else d.settings.overrides[contactId] = Math.max(1, Math.min(365, Math.round(days)));
  });
  revalidatePath("/receivables");
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
  const decision: Decision = {
    action: input.action,
    note: input.note.trim(),
    by: input.by.trim(),
    at: new Date().toISOString(),
    snoozeUntil: input.action === "snooze" ? input.snoozeUntil : undefined,
    invoiceIds: input.invoiceIds,
  };
  await updateStore((d) => {
    (d.decisions[input.contactId] ??= []).push(decision);
  });
  revalidatePath("/receivables");
  return { ok: true };
}

export async function markNotDuplicates(clusterKey: string) {
  await updateStore((d) => {
    if (!d.notDuplicates.includes(clusterKey)) d.notDuplicates.push(clusterKey);
  });
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
