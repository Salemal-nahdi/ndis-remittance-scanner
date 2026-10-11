/**
 * On an always-on server, runs the overdue check once a day after ALERT_HOUR
 * (business time zone). On serverless hosting this timer doesn't stay alive;
 * vercel.json schedules /api/alerts/run instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || process.env.DISABLE_ALERT_SCHEDULER) return;
  const { getLastAlertRun, getXeroConnection } = await import("./lib/store");
  const { runAlertCheck } = await import("./lib/run-alerts");
  const { BUSINESS_TZ, todayISO } = await import("./lib/dates");
  const alertHour = Number(process.env.ALERT_HOUR ?? 8);

  const tick = async () => {
    const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: BUSINESS_TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    const [xero, lastAlertRun] = await Promise.all([getXeroConnection(), getLastAlertRun()]);
    if (!xero || hour < alertHour || lastAlertRun?.date === todayISO()) return;
    await runAlertCheck();
  };
  setInterval(() => tick().catch((err) => console.error("Alert check failed", err)), 15 * 60_000);
}
