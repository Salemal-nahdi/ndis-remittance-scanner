/** Dollars to integer cents, so totals don't drift with floating point. */
export function toCents(amount: number | undefined | null): number {
  return Math.round((amount ?? 0) * 100);
}

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

export function formatCents(cents: number): string {
  return aud.format(cents / 100);
}
