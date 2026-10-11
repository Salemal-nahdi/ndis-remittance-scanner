export type PayerType = "ndia" | "plan_managed" | "self_managed";

export interface Payer {
  type: PayerType;
  /** Plan manager's name, for plan-managed participants. */
  planManager?: string;
}

export const PAYER_TYPE_LABELS: Record<PayerType, string> = {
  ndia: "NDIA (agency managed)",
  plan_managed: "Plan managed",
  self_managed: "Self managed",
};

/** Short label for tables and emails, e.g. "NDIA", "Example Plan Partners" or "Self managed". */
export function payerLabel(p: Payer | undefined): string {
  if (!p) return "Not set";
  if (p.type === "ndia") return "NDIA";
  if (p.type === "self_managed") return "Self managed";
  return p.planManager?.trim() || "Plan managed (manager not set)";
}
